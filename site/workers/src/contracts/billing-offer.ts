import * as Schema from 'effect/Schema';
import { Effect } from 'effect';

/** Public offer identifiers accepted by checkout. */
export const BillingOfferSchema = Schema.Literal('pro', 'team');
export type BillingOffer = Schema.Schema.Type<typeof BillingOfferSchema>;

/** HTTP body accepted by the checkout endpoint. */
export const CheckoutRequestSchema = Schema.Struct({
  offer: BillingOfferSchema,
});

/** Parsed checkout request whose offer is controlled by the server contract. */
export type CheckoutRequest = Schema.Schema.Type<typeof CheckoutRequestSchema>;

const StripePriceIdSchema = Schema.String.pipe(
  Schema.pattern(/^price_[A-Za-z0-9_]+$/),
  Schema.brand('StripePriceId')
);
export type StripePriceId = Schema.Schema.Type<typeof StripePriceIdSchema>;

/** Server-owned Stripe prices available for public billing offers. */
export interface BillingCatalog {
  readonly proPriceId: string | undefined;
  readonly teamPriceId: string | undefined;
}

/** Canonical license limits granted by one server-owned billing offer. */
export interface BillingEntitlement {
  readonly tier: BillingOffer;
  readonly maxSeats: number;
}

const BILLING_ENTITLEMENTS = {
  pro: { tier: 'pro', maxSeats: 3 },
  team: { tier: 'team', maxSeats: 10 },
} as const satisfies Record<BillingOffer, BillingEntitlement>;

/** The selected offer has no valid server-owned Stripe price configured. */
export class BillingOfferUnavailable extends Error {
  readonly _tag = 'BillingOfferUnavailable';

  constructor(
    readonly offer: BillingOffer,
    override readonly cause: unknown
  ) {
    super(`Billing offer ${offer} is unavailable`);
  }
}

/** A Stripe Price cannot be projected to exactly one server-owned entitlement. */
export class BillingEntitlementUnavailable extends Error {
  readonly _tag = 'BillingEntitlementUnavailable';

  constructor(
    readonly priceId: string,
    override readonly cause: unknown
  ) {
    super(`Stripe Price ${priceId} has no unambiguous billing entitlement`);
  }
}

/**
 * Resolve a public offer to a parsed server-owned Stripe price identifier.
 *
 * @param offer - Parsed public offer.
 * @param catalog - Worker configuration containing Stripe price identifiers.
 * @returns The configured Stripe price or `BillingOfferUnavailable`.
 */
export function resolveBillingPrice(
  offer: BillingOffer,
  catalog: BillingCatalog
): Effect.Effect<StripePriceId, BillingOfferUnavailable> {
  const configuredPrice = offer === 'pro' ? catalog.proPriceId : catalog.teamPriceId;
  return Schema.decodeUnknown(StripePriceIdSchema)(configuredPrice).pipe(
    Effect.mapError(cause => new BillingOfferUnavailable(offer, cause))
  );
}

/** Resolve a Stripe Price to exactly one canonical license entitlement. */
export function resolveBillingEntitlement(
  priceId: string,
  catalog: BillingCatalog
): Effect.Effect<BillingEntitlement, BillingEntitlementUnavailable> {
  return Effect.gen(function* () {
    const proPrice = yield* resolveBillingPrice('pro', catalog).pipe(
      Effect.mapError(cause => new BillingEntitlementUnavailable(priceId, cause))
    );
    const teamPrice = yield* resolveBillingPrice('team', catalog).pipe(
      Effect.mapError(cause => new BillingEntitlementUnavailable(priceId, cause))
    );
    if (proPrice === teamPrice) {
      return yield* Effect.fail(
        new BillingEntitlementUnavailable(priceId, new Error('Billing prices must be unique'))
      );
    }
    if (priceId === proPrice) {
      return BILLING_ENTITLEMENTS.pro;
    }
    if (priceId === teamPrice) {
      return BILLING_ENTITLEMENTS.team;
    }
    return yield* Effect.fail(
      new BillingEntitlementUnavailable(priceId, new Error('Stripe Price is not in the catalog'))
    );
  });
}
