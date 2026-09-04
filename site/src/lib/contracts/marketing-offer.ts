import * as Schema from 'effect/Schema';
import { EMAIL_PATTERN } from '../../../../shared/email';

const OFFER_EMAIL_MAX_LENGTH = 254;

export const MarketingOfferRequestSchema = Schema.Struct({
  email: Schema.String.check(
    Schema.isTrimmed(),
    Schema.isLowercased(),
    Schema.isMaxLength(OFFER_EMAIL_MAX_LENGTH),
    Schema.isPattern(EMAIL_PATTERN)
  ),
});

export const MarketingPromotionCodeSchema = Schema.String.check(
  Schema.isPattern(/^OMG20-[A-Z0-9]{8}$/u)
);

const MARKETING_OFFER_PERCENT_OFF = 20;
const MARKETING_OFFER_DURATION_MONTHS = 3;

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
