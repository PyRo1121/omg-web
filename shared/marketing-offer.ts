import * as Schema from 'effect/Schema';
import { EmailAddress } from './site-session';

/** Public request for one introductory Stripe promotion code. */
export const MarketingOfferRequestSchema = Schema.Struct({
  email: EmailAddress,
});

/** Customer-facing code shape accepted by offer and checkout boundaries. */
export const MarketingPromotionCodeSchema = Schema.String.pipe(
  Schema.pattern(/^OMG20-[A-Z0-9]{8}$/u)
);
export type MarketingPromotionCode = Schema.Schema.Type<typeof MarketingPromotionCodeSchema>;

/** Customer-facing offer terms. The site copy and the schemas must match. */
export const MARKETING_OFFER_PERCENT_OFF = 20;
export const MARKETING_OFFER_DURATION_MONTHS = 3;

/** Landing-page price labels mirroring the Worker's Stripe catalog identity. */
export const PRO_MONTHLY_PRICE_LABEL = '$9';
export const TEAM_MONTHLY_PRICE_LABEL = '$200';

/** Customer-facing promotion code. Stripe object identifiers stay server-side. */
export const MarketingOfferResponseSchema = Schema.Struct({
  code: MarketingPromotionCodeSchema,
  percentOff: Schema.Literal(MARKETING_OFFER_PERCENT_OFF),
  durationMonths: Schema.Literal(MARKETING_OFFER_DURATION_MONTHS),
  expiresAt: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}T/u)),
});
export type MarketingOfferResponse = Schema.Schema.Type<typeof MarketingOfferResponseSchema>;
