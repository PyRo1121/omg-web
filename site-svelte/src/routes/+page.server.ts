import { startBillingCheckoutAction } from '../lib/server/billing-action.server';
import { claimMarketingOfferAction } from '../lib/server/marketing-offer-action.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { fulfillment: null };
};

export const actions = {
  claimOffer: claimMarketingOfferAction,
  startCheckout: startBillingCheckoutAction,
} satisfies Actions;
