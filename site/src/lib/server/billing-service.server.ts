import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  BillingCheckoutInputSchema,
  BillingCheckoutResponseSchema,
  BillingCheckoutStatusResponseSchema,
  BillingPortalResponseSchema,
  billingCheckoutSessionPath,
  type BillingCheckoutRedirect,
  type BillingFulfillment,
  type BillingPortalRedirect,
} from '../contracts/billing';
import {
  LicensingSummaryInvalidInput,
  loadPrivateWorkerPayload,
  loadUserServiceSession,
  parseLicensingInput,
  sendPrivateWorkerPayload,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';

const CHECKOUT_RESPONSE_LIMIT = 8 * 1024;
type BillingBoundaryInput = Schema.Top['Encoded'];
const FULFILLMENT_RESPONSE_LIMIT = 8 * 1024;
const PORTAL_RESPONSE_LIMIT = 8 * 1024;

/** Create an authenticated Stripe Checkout Session through the private Worker boundary. */
export function createBillingCheckout(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: BillingBoundaryInput
): Effect.Effect<BillingCheckoutRedirect, LicensingSummaryError> {
  return Effect.gen(function* () {
    const parsed = yield* parseLicensingInput(
      BillingCheckoutInputSchema,
      input,
      'Billing checkout input is invalid'
    );
    const session = yield* loadUserServiceSession(identity, env);
    const checkout = yield* sendPrivateWorkerPayload(
      env,
      session,
      '/api/billing/checkout',
      'billing-checkout',
      CHECKOUT_RESPONSE_LIMIT,
      BillingCheckoutResponseSchema,
      parsed
    );
    return { url: checkout.url };
  });
}

/** Open Stripe Billing Portal for the verified account through the private Worker boundary. */
export function createBillingPortal(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<BillingPortalRedirect, LicensingSummaryError> {
  return Effect.gen(function* () {
    const session = yield* loadUserServiceSession(identity, env);
    const portal = yield* sendPrivateWorkerPayload(
      env,
      session,
      '/api/billing/portal',
      'billing-portal',
      PORTAL_RESPONSE_LIMIT,
      BillingPortalResponseSchema,
      {}
    );
    return { url: portal.url };
  });
}

/** Verify fulfillment while discarding license keys, email, and provider identifiers server-side. */
export function loadBillingFulfillment(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  sessionId: string
): Effect.Effect<BillingFulfillment, LicensingSummaryError> {
  return Effect.gen(function* () {
    const path = billingCheckoutSessionPath(sessionId);
    if (path === null) {
      return yield* Effect.fail(
        new LicensingSummaryInvalidInput('Checkout session identifier is invalid')
      );
    }
    const session = yield* loadUserServiceSession(identity, env);
    const status = yield* loadPrivateWorkerPayload(
      env,
      session,
      path,
      'billing-fulfillment',
      FULFILLMENT_RESPONSE_LIMIT,
      BillingCheckoutStatusResponseSchema
    );
    if (status.status !== 'paid') {
      return { kind: 'unverified' };
    }
    if (status.license === undefined || status.license === null) {
      return { kind: 'processing' };
    }
    return { kind: 'ready', tier: status.license.tier };
  });
}
