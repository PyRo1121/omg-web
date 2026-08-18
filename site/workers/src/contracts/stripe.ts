// Boundary parser internals decode Stripe JSON into typed billing values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';

/** A failure decoding a Stripe API payload. */
export class StripeParseError extends Error {
  readonly _tag = 'StripeParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

function mapParseError(reason: string) {
  return (cause: unknown): StripeParseError => new StripeParseError(reason, cause);
}

const StripeErrorSchema = Schema.Struct({
  message: Schema.String,
});

/** Checkout session returned by Stripe. */
export const StripeCheckoutSessionSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  error: Schema.optional(StripeErrorSchema),
});
export type StripeCheckoutSession = Schema.Schema.Type<typeof StripeCheckoutSessionSchema>;

/** Billing portal session returned by Stripe. */
export const StripePortalSessionSchema = Schema.Struct({
  url: Schema.optional(Schema.String),
  error: Schema.optional(StripeErrorSchema),
});
export type StripePortalSession = Schema.Schema.Type<typeof StripePortalSessionSchema>;

/** Customer lookup used when a webhook has no local row. */
export const StripeCustomerEmailSchema = Schema.Struct({
  email: Schema.String,
});
export type StripeCustomerEmail = Schema.Schema.Type<typeof StripeCustomerEmailSchema>;

/** Customer record from list/sync. */
export const StripeCustomerSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.Union(Schema.Null, Schema.String),
  name: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  metadata: Schema.optional(
    Schema.Struct({
      company: Schema.optional(Schema.String),
    })
  ),
});
export type StripeCustomer = Schema.Schema.Type<typeof StripeCustomerSchema>;

/** Subscription record from list/sync. */
export const StripeSubscriptionSchema = Schema.Struct({
  id: Schema.String,
  customer: Schema.String,
  status: Schema.String,
  current_period_end: Schema.Number,
});
export type StripeSubscription = Schema.Schema.Type<typeof StripeSubscriptionSchema>;

/** Invoice record from list/sync. */
export const StripeInvoiceSchema = Schema.Struct({
  id: Schema.String,
  customer: Schema.String,
  status: Schema.String,
  amount_paid: Schema.optional(Schema.Number),
  currency: Schema.optional(Schema.String),
  hosted_invoice_url: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  invoice_pdf: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  period_start: Schema.optional(Schema.Number),
  period_end: Schema.optional(Schema.Number),
  created: Schema.optional(Schema.Number),
});
export type StripeInvoice = Schema.Schema.Type<typeof StripeInvoiceSchema>;

const StripePriceSchema = Schema.Struct({
  unit_amount: Schema.optional(Schema.Number),
  recurring: Schema.optional(
    Schema.Struct({
      interval: Schema.optional(Schema.String),
      interval_count: Schema.optional(Schema.Number),
    })
  ),
});

const StripeSubscriptionItemSchema = Schema.Struct({
  price: StripePriceSchema,
});

/** Active subscription used for MRR metrics. */
export const StripeMetricsSubscriptionSchema = Schema.Struct({
  items: Schema.Struct({
    data: Schema.Array(StripeSubscriptionItemSchema),
  }),
});
export type StripeMetricsSubscription = Schema.Schema.Type<typeof StripeMetricsSubscriptionSchema>;

/** One Stripe balance bucket. */
export const StripeBalanceFundsSchema = Schema.Struct({
  amount: Schema.Number,
});

/** Stripe balance payload. */
export const StripeBalanceSchema = Schema.Struct({
  available: Schema.Array(StripeBalanceFundsSchema),
  pending: Schema.Array(StripeBalanceFundsSchema),
});
export type StripeBalance = Schema.Schema.Type<typeof StripeBalanceSchema>;

export const StripeCustomerListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeCustomerSchema),
});
export type StripeCustomerList = Schema.Schema.Type<typeof StripeCustomerListSchema>;

export const StripeSubscriptionListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeSubscriptionSchema),
});
export type StripeSubscriptionList = Schema.Schema.Type<typeof StripeSubscriptionListSchema>;

export const StripeInvoiceListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeInvoiceSchema),
});
export type StripeInvoiceList = Schema.Schema.Type<typeof StripeInvoiceListSchema>;

export const StripeMetricsListSchema = Schema.Struct({
  data: Schema.Array(StripeMetricsSubscriptionSchema),
});
export type StripeMetricsList = Schema.Schema.Type<typeof StripeMetricsListSchema>;

/** Signed Stripe webhook envelope. */
export const StripeWebhookEventSchema = Schema.Struct({
  type: Schema.String,
  data: Schema.Struct({
    object: Schema.Struct({
      id: Schema.optional(Schema.String),
      customer: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
      status: Schema.optional(Schema.String),
      current_period_end: Schema.optional(Schema.Number),
      amount_paid: Schema.optional(Schema.Number),
      amount_due: Schema.optional(Schema.Number),
      currency: Schema.optional(Schema.String),
      hosted_invoice_url: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
      invoice_pdf: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
      period_start: Schema.optional(Schema.Number),
      period_end: Schema.optional(Schema.Number),
      created: Schema.optional(Schema.Number),
      name: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
      email: Schema.optional(Schema.String),
      metadata: Schema.optional(
        Schema.Struct({
          company: Schema.optional(Schema.String),
        })
      ),
      items: Schema.optional(
        Schema.Struct({
          data: Schema.Array(StripeSubscriptionItemSchema),
        })
      ),
    }),
  }),
});
export type StripeWebhookEvent = Schema.Schema.Type<typeof StripeWebhookEventSchema>;

/**
 * Decode an untrusted Stripe JSON payload.
 *
 * @param schema - Item schema.
 * @param reason - Parse error reason.
 * @param value - Raw `response.json()` result.
 * @returns The typed payload, or `StripeParseError`.
 */
export function decodeStripeJson<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<Schema.Schema.Type<S>, StripeParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(mapParseError(reason)));
}

/**
 * Decode a signed Stripe webhook body.
 *
 * @param body - Raw request text after signature verification.
 * @returns The typed event, or `StripeParseError`.
 */
export function decodeStripeWebhookText(
  body: string
): Effect.Effect<StripeWebhookEvent, StripeParseError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    return Effect.fail(new StripeParseError('Stripe webhook body is not valid JSON', cause));
  }
  return decodeStripeJson(
    StripeWebhookEventSchema,
    'Stripe webhook event has an invalid shape',
    parsed
  );
}
