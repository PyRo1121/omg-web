import { fail, type ActionFailure } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import type { MarketingOffer } from '../contracts/marketing-offer';
import {
  BoundedFormRejected,
  BoundedFormUnavailable,
  readBoundedUrlEncodedForm,
} from './bounded-form.server';
import {
  LicensingSummaryInvalidInput,
  LicensingSummaryWorkerRejected,
  claimMarketingOffer,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
} from './licensing-service.server';

const MAX_OFFER_FORM_BYTES = 4096;

class MarketingOfferActionUnavailable extends Error {
  readonly _tag = 'MarketingOfferActionUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Offer service unavailable');
  }
}

type MarketingOfferActionError =
  | BoundedFormRejected
  | BoundedFormUnavailable
  | MarketingOfferActionUnavailable
  | LicensingSummaryError;

interface MarketingOfferActionEvent {
  readonly getClientAddress: () => string;
  readonly platform: { readonly env: LicensingSummaryEnvironment } | undefined;
  readonly request: Request;
}

interface MarketingOfferActionFailure {
  readonly kind: 'offer-error';
  readonly message: string;
}

interface MarketingOfferActionSuccess {
  readonly kind: 'offer';
  readonly offer: MarketingOffer;
}

type MarketingOfferActionResult =
  MarketingOfferActionSuccess | ActionFailure<MarketingOfferActionFailure>;

function readOfferEmail(
  request: Request
): Effect.Effect<string, BoundedFormRejected | BoundedFormUnavailable> {
  return readBoundedUrlEncodedForm(request, MAX_OFFER_FORM_BYTES).pipe(
    Effect.flatMap(params => {
      const email = params.get('email');
      return email === null
        ? Effect.fail(new BoundedFormRejected(400, 'invalid'))
        : Effect.succeed(email);
    })
  );
}

function offerActionEffect(
  event: MarketingOfferActionEvent
): Effect.Effect<MarketingOffer, MarketingOfferActionError> {
  return Effect.gen(function* () {
    if (event.platform === undefined) {
      return yield* Effect.fail(new MarketingOfferActionUnavailable());
    }
    const email = yield* readOfferEmail(event.request);
    const clientAddress = yield* Effect.try({
      try: event.getClientAddress,
      catch: cause => new MarketingOfferActionUnavailable(cause),
    });
    return yield* claimMarketingOffer(email, clientAddress, event.platform.env);
  });
}

/** Execute the public offer action with bounded form parsing and safe failures. */
export async function claimMarketingOfferAction(
  event: MarketingOfferActionEvent
): Promise<MarketingOfferActionResult> {
  const exit = await Effect.runPromiseExit(offerActionEffect(event));
  if (Exit.isSuccess(exit)) {
    return { kind: 'offer', offer: exit.value };
  }
  const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
  if (failure instanceof BoundedFormRejected) {
    return fail(failure.status, {
      kind: 'offer-error',
      message:
        failure.reason === 'too-large'
          ? 'Offer request is too large.'
          : 'Enter a valid email address.',
    });
  }
  if (failure instanceof LicensingSummaryInvalidInput) {
    return fail(400, { kind: 'offer-error', message: 'Enter a valid email address.' });
  }
  if (failure instanceof LicensingSummaryWorkerRejected) {
    if (failure.status === 429) {
      return fail(429, {
        kind: 'offer-error',
        message: 'Too many offer requests. Try again later.',
      });
    }
    if (failure.status === 409) {
      return fail(409, {
        kind: 'offer-error',
        message: 'Offer generation is already in progress. Try again shortly.',
      });
    }
  }
  return fail(503, { kind: 'offer-error', message: 'Offer service unavailable.' });
}
