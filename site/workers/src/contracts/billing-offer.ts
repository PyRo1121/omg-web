import { Schema } from '@effect/schema';
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

/** The selected offer has no valid server-owned Stripe price configured. */
export class BillingOfferUnavailable extends Error {
  readonly _tag = 'BillingOfferUnavailable';

  constructor(
    readonly offer: BillingOffer,
    readonly cause: unknown
  ) {
    super(`Billing offer ${offer} is unavailable`);
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
