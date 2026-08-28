import * as Schema from 'effect/Schema';
import { EMAIL_PATTERN } from '../../../../site/shared/email';

export const MarketingOfferRequestSchema = Schema.Struct({
  email: Schema.String.check(
    Schema.isTrimmed(),
    Schema.isLowercased(),
    Schema.isMaxLength(254),
    Schema.isPattern(EMAIL_PATTERN)
  ),
});

export const MarketingOfferResponseSchema = Schema.Struct({
  code: Schema.String.check(Schema.isPattern(/^OMG20-[A-Z0-9]{8}$/u)),
  percentOff: Schema.Literal(20),
  durationMonths: Schema.Literal(3),
  expiresAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T/u),
    Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
  ),
});

export type MarketingOffer = Schema.Schema.Type<typeof MarketingOfferResponseSchema>;
