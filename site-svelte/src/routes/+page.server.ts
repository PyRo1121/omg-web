import { Effect, Exit } from 'effect';
import { loadAccountIdentity } from '../lib/server/account-dashboard.server';
import { startBillingCheckoutAction } from '../lib/server/billing-action.server';
import { loadBillingFulfillment } from '../lib/server/billing-service.server';
import { claimMarketingOfferAction } from '../lib/server/marketing-offer-action.server';
import { reportEffectFailure } from '../lib/server/observability.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const sessionId = event.url.searchParams.get('session_id');
  if (event.url.searchParams.get('success') !== 'true' || sessionId === null) {
    return { fulfillment: null };
  }

  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  if (event.platform === undefined) {
    return { fulfillment: { kind: 'unverified' } as const };
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    return { fulfillment: { kind: 'unverified' } as const };
  }
  const exit = await Effect.runPromiseExit(
    loadBillingFulfillment(identity.user, event.platform.env, sessionId)
  );
  if (Exit.isFailure(exit)) {
    reportEffectFailure('billing.fulfillment_failed', exit.cause);
    return { fulfillment: { kind: 'unverified' } as const };
  }
  return { fulfillment: exit.value };
};

export const actions = {
  claimOffer: claimMarketingOfferAction,
  startCheckout: startBillingCheckoutAction,
} satisfies Actions;
