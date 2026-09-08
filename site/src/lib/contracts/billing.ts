import * as Schema from 'effect/Schema';

const TrustedStripeBillingUrlSchema = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.makeFilter(value => {
    const parsed = URL.parse(value);
    return (
      parsed !== null &&
      parsed.protocol === 'https:' &&
      parsed.hostname === 'billing.stripe.com' &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  })
);

export const BillingPortalResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  url: TrustedStripeBillingUrlSchema,
});

export interface BillingPortalRedirect {
  readonly url: string;
}
