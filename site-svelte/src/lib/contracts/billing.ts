import { Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { MarketingPromotionCodeSchema } from './marketing-offer';

export const BillingOfferSchema = Schema.Literals(['pro', 'team']);
export type BillingOffer = Schema.Schema.Type<typeof BillingOfferSchema>;

export const BillingCheckoutInputSchema = Schema.Struct({
  offer: BillingOfferSchema,
  promotionCode: Schema.optional(MarketingPromotionCodeSchema),
});
export type BillingCheckoutInput = Schema.Schema.Type<typeof BillingCheckoutInputSchema>;

const StripeCheckoutSessionIdSchema = Schema.String.check(
  Schema.isPattern(/^cs_[A-Za-z0-9]{10,200}$/u)
);

const TrustedStripeCheckoutUrlSchema = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.makeFilter(value => {
    const parsed = URL.parse(value);
    return (
      parsed !== null &&
      parsed.protocol === 'https:' &&
      parsed.hostname === 'checkout.stripe.com' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  })
);

export const BillingCheckoutResponseSchema = Schema.Struct({
  sessionId: StripeCheckoutSessionIdSchema,
  url: TrustedStripeCheckoutUrlSchema,
});
export interface BillingCheckoutRedirect {
  readonly url: string;
}

const LicenseProjectionSchema = Schema.Struct({
  license_key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  tier: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
});

export const BillingCheckoutStatusResponseSchema = Schema.Struct({
  status: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  email: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(254)))),
  license: Schema.optional(Schema.NullOr(LicenseProjectionSchema)),
});

export type BillingFulfillment =
  | { readonly kind: 'ready'; readonly tier: string }
  | { readonly kind: 'processing' }
  | { readonly kind: 'unverified' };

export function billingCheckoutSessionPath(sessionId: string): `/${string}` | null {
  const decoded = Schema.decodeUnknownExit(StripeCheckoutSessionIdSchema)(sessionId);
  return Exit.isSuccess(decoded)
    ? `/api/billing/checkout-session?id=${encodeURIComponent(decoded.value)}`
    : null;
}
