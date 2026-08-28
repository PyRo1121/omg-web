import { claimMarketingOfferAction } from '../lib/server/marketing-offer-action.server';
import type { Actions } from './$types';

export const actions = {
  claimOffer: claimMarketingOfferAction,
} satisfies Actions;
