import * as Schema from 'effect/Schema';
import { EmailAddress } from './site-session';

/** Public request for one introductory Stripe promotion code. */
export const MarketingOfferRequestSchema = Schema.Struct({
  email: EmailAddress,
});
export type MarketingOfferRequest = Schema.Schema.Type<typeof MarketingOfferRequestSchema>;

/** Customer-facing code shape accepted by offer and checkout boundaries. */
export const MarketingPromotionCodeSchema = Schema.String.pipe(
  Schema.pattern(/^OMG20-[A-Z0-9]{8}$/u)
);
export type MarketingPromotionCode = Schema.Schema.Type<typeof MarketingPromotionCodeSchema>;

/** Customer-facing promotion code. Stripe object identifiers stay server-side. */
export const MarketingOfferResponseSchema = Schema.Struct({
  code: MarketingPromotionCodeSchema,
  percentOff: Schema.Literal(20),
  durationMonths: Schema.Literal(3),
  expiresAt: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}T/u)),
});
export type MarketingOfferResponse = Schema.Schema.Type<typeof MarketingOfferResponseSchema>;
