import { fail, redirect, type ActionFailure } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import type { BillingOffer } from '../contracts/billing';
import { loadAccountIdentity, type AccountDashboardIdentity } from './account-dashboard.server';
import type { AuthEnvironment } from './auth.server';
import {
  BoundedFormRejected,
  readBoundedUrlEncodedForm,
  type BoundedFormUnavailable,
} from './bounded-form.server';
import { createBillingCheckout } from './billing-service.server';
import {
  LicensingSummaryInvalidInput,
  LicensingSummaryWorkerRejected,
  type LicensingSummaryEnvironment,
} from './licensing-service.server';

const MAX_CHECKOUT_FORM_BYTES = 4096;

type BillingActionEnvironment = AuthEnvironment & LicensingSummaryEnvironment;

interface BillingActionEvent {
  readonly platform: { readonly env: BillingActionEnvironment } | undefined;
  readonly request: Request;
  readonly url: URL;
}

interface RawCheckoutInput {
  readonly offer: string | null;
  readonly promotionCode?: string;
}

interface BillingActionFailure {
  readonly kind: 'checkout-error';
  readonly message: string;
  readonly offer: BillingOffer | null;
  readonly promotionCode: string | null;
}

type IdentityLoader = (event: BillingActionEvent) => Promise<AccountDashboardIdentity | null>;
type CheckoutCreator = typeof createBillingCheckout;

interface BillingActionDependencies {
  readonly loadIdentity: IdentityLoader;
  readonly createCheckout: CheckoutCreator;
}

const defaultDependencies: BillingActionDependencies = {
  loadIdentity: loadAccountIdentity,
  createCheckout: createBillingCheckout,
};

function checkoutInput(
  request: Request
): Effect.Effect<RawCheckoutInput, BoundedFormRejected | BoundedFormUnavailable> {
  return readBoundedUrlEncodedForm(request, MAX_CHECKOUT_FORM_BYTES).pipe(
    Effect.map(params => {
      const promotionCode = params.get('promotionCode');
      return promotionCode === null || promotionCode === ''
        ? { offer: params.get('offer') }
        : { offer: params.get('offer'), promotionCode };
    })
  );
}

function safeOffer(input: RawCheckoutInput | null): BillingOffer | null {
  return input?.offer === 'pro' || input?.offer === 'team' ? input.offer : null;
}

function safePromotionCode(input: RawCheckoutInput | null): string | null {
  return input?.promotionCode !== undefined && /^OMG20-[A-Z0-9]{8}$/u.test(input.promotionCode)
    ? input.promotionCode
    : null;
}

/** Start authenticated Checkout and redirect only to a schema-validated Stripe host. */
export async function startBillingCheckoutAction(
  event: BillingActionEvent,
  dependencies: BillingActionDependencies = defaultDependencies
): Promise<ActionFailure<BillingActionFailure>> {
  let input: RawCheckoutInput | null = null;
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      input = yield* checkoutInput(event.request);
      if (event.platform === undefined) {
        return yield* Effect.fail(new BillingActionUnavailable());
      }
      const identity = yield* Effect.tryPromise({
        try: () => dependencies.loadIdentity(event),
        catch: cause => new BillingActionUnavailable(cause),
      });
      if (identity === null) {
        return yield* Effect.fail(new BillingAuthenticationRequired());
      }
      return yield* dependencies.createCheckout(identity.user, event.platform.env, input);
    })
  );

  if (Exit.isSuccess(exit)) {
    redirect(303, exit.value.url, { external: ['https://checkout.stripe.com'] });
  }

  const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
  const offer = safeOffer(input);
  const promotionCode = safePromotionCode(input);
  if (failure instanceof BoundedFormRejected) {
    return fail(failure.status, {
      kind: 'checkout-error',
      message:
        failure.reason === 'too-large'
          ? 'Checkout request is too large.'
          : 'Choose a valid billing plan.',
      offer,
      promotionCode,
    });
  }
  if (failure instanceof BillingAuthenticationRequired) {
    return fail(401, {
      kind: 'checkout-error',
      message: 'Sign in before starting checkout.',
      offer,
      promotionCode,
    });
  }
  if (failure instanceof LicensingSummaryInvalidInput) {
    return fail(400, {
      kind: 'checkout-error',
      message:
        promotionCode === null
          ? 'Choose a valid billing plan.'
          : 'This offer must be used with the account that requested it.',
      offer,
      promotionCode,
    });
  }
  if (failure instanceof LicensingSummaryWorkerRejected) {
    if (failure.status === 400) {
      return fail(400, {
        kind: 'checkout-error',
        message: 'This offer must be used with the account that requested it.',
        offer,
        promotionCode,
      });
    }
    if (failure.status === 401 || failure.status === 403) {
      return fail(401, {
        kind: 'checkout-error',
        message: 'Sign in again before starting checkout.',
        offer,
        promotionCode,
      });
    }
    if (failure.status === 429) {
      return fail(429, {
        kind: 'checkout-error',
        message: 'Too many checkout attempts. Try again later.',
        offer,
        promotionCode,
      });
    }
  }
  return fail(503, {
    kind: 'checkout-error',
    message: 'Checkout is temporarily unavailable.',
    offer,
    promotionCode,
  });
}

class BillingActionUnavailable extends Error {
  readonly _tag = 'BillingActionUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Billing action unavailable');
  }
}

class BillingAuthenticationRequired extends Error {
  readonly _tag = 'BillingAuthenticationRequired';
  constructor() {
    super('Billing authentication required');
  }
}
