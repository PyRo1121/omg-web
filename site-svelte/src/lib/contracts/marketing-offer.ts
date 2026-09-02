import * as Schema from 'effect/Schema';
import { EMAIL_PATTERN } from '../../../../shared/email';

export const MarketingOfferRequestSchema = Schema.Struct({
  email: Schema.String.check(
    Schema.isTrimmed(),
    Schema.isLowercased(),
    Schema.isMaxLength(254),
    Schema.isPattern(EMAIL_PATTERN)
  ),
});

export const MarketingPromotionCodeSchema = Schema.String.check(
  Schema.isPattern(/^OMG20-[A-Z0-9]{8}$/u)
);

/** Offer terms the landing copy must display. The schemas pin the same values. */
export const MARKETING_OFFER_PERCENT_OFF = 20;
export const MARKETING_OFFER_DURATION_MONTHS = 3;

/** Landing-page price labels mirroring the Worker's Stripe catalog identity. */
export const PRO_MONTHLY_PRICE_LABEL = '$9';
export const TEAM_MONTHLY_PRICE_LABEL = '$200';

export const MarketingOfferResponseSchema = Schema.Struct({
  code: MarketingPromotionCodeSchema,
  percentOff: Schema.Literal(MARKETING_OFFER_PERCENT_OFF),
  durationMonths: Schema.Literal(MARKETING_OFFER_DURATION_MONTHS),
  expiresAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T/u),
    Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
  ),
});

export type MarketingOffer = Schema.Schema.Type<typeof MarketingOfferResponseSchema>;
