import { Schema } from '@effect/schema';
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import * as BillingEntitlements from '../src/contracts/billing-offer';
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

  it('projects server-owned prices to canonical entitlements', async () => {
    await expect(
      Effect.runPromise(BillingEntitlements.resolveBillingEntitlement('price_pro_server', catalog))
    ).resolves.toMatchObject({ tier: 'pro', maxSeats: 3 });
    await expect(
      Effect.runPromise(BillingEntitlements.resolveBillingEntitlement('price_team_server', catalog))
    ).resolves.toMatchObject({ tier: 'team', maxSeats: 10 });
  });

  it('rejects an active price outside the server-owned catalog', async () => {
    const exit = await Effect.runPromiseExit(
      BillingEntitlements.resolveBillingEntitlement('price_retired_or_attacker', catalog)
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects an ambiguous catalog with duplicate prices', async () => {
    const exit = await Effect.runPromiseExit(
      BillingEntitlements.resolveBillingEntitlement('price_shared', {
        proPriceId: 'price_shared',
        teamPriceId: 'price_shared',
      })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
