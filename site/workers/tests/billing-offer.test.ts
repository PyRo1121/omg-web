import { Schema } from '@effect/schema';
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CheckoutRequestSchema,
  resolveBillingPrice,
  type BillingCatalog,
} from '../src/contracts/billing-offer';

const catalog: BillingCatalog = {
  proPriceId: 'price_pro_server',
  teamPriceId: 'price_team_server',
};

describe('billing offer contract', () => {
  it('rejects caller-supplied Stripe price identifiers', async () => {
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknown(CheckoutRequestSchema)({ priceId: 'price_attacker_controlled' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('maps a Pro offer to the server-owned Stripe price', async () => {
    const request = await Effect.runPromise(
      Schema.decodeUnknown(CheckoutRequestSchema)({ offer: 'pro' })
    );
    const priceId = await Effect.runPromise(resolveBillingPrice(request.offer, catalog));
    expect(priceId).toBe('price_pro_server');
  });

  it('maps a Team offer to the server-owned Stripe price', async () => {
    const request = await Effect.runPromise(
      Schema.decodeUnknown(CheckoutRequestSchema)({ offer: 'team' })
    );
    const priceId = await Effect.runPromise(resolveBillingPrice(request.offer, catalog));
    expect(priceId).toBe('price_team_server');
  });

  it('fails closed when an offer is not configured', async () => {
    const exit = await Effect.runPromiseExit(
      resolveBillingPrice('pro', { proPriceId: undefined, teamPriceId: 'price_team_server' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
