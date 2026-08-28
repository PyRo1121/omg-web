import { fail, type ActionFailure } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import type { MarketingOffer } from '../contracts/marketing-offer';
import {
  LicensingSummaryInvalidInput,
  LicensingSummaryWorkerRejected,
  claimMarketingOffer,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
} from './licensing-service.server';

const MAX_OFFER_FORM_BYTES = 4096;

class MarketingOfferFormRejected extends Error {
  readonly _tag = 'MarketingOfferFormRejected';
  constructor(
    readonly status: 400 | 413,
    readonly publicMessage: string
  ) {
    super(publicMessage);
  }
}

class MarketingOfferActionUnavailable extends Error {
  readonly _tag = 'MarketingOfferActionUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Offer service unavailable');
  }
}

type MarketingOfferActionError =
  MarketingOfferFormRejected | MarketingOfferActionUnavailable | LicensingSummaryError;

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
): Effect.Effect<string, MarketingOfferFormRejected | MarketingOfferActionUnavailable> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OFFER_FORM_BYTES) {
    return Effect.fail(new MarketingOfferFormRejected(413, 'Offer request is too large.'));
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
    return Effect.fail(new MarketingOfferFormRejected(400, 'Offer form is invalid.'));
  }
  return Effect.tryPromise({
    try: async () => {
      const reader = request.body?.getReader();
      if (reader === undefined) {
        throw new MarketingOfferFormRejected(400, 'Enter a valid email address.');
      }
      const chunks: Array<Uint8Array> = [];
      let total = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        total += next.value.byteLength;
        if (total > MAX_OFFER_FORM_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new MarketingOfferFormRejected(413, 'Offer request is too large.');
        }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const email = new URLSearchParams(new TextDecoder().decode(bytes)).get('email');
      if (email === null) {
        throw new MarketingOfferFormRejected(400, 'Enter a valid email address.');
      }
      return email;
    },
    catch: cause =>
      cause instanceof MarketingOfferFormRejected
        ? cause
        : new MarketingOfferActionUnavailable(cause),
  });
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
  if (failure instanceof MarketingOfferFormRejected) {
    return fail(failure.status, { kind: 'offer-error', message: failure.publicMessage });
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
