// Boundary parser internals decode Stripe JSON into typed billing values.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

/** A failure decoding a Stripe API payload. */
export class StripeParseError extends Error {
  readonly _tag = 'StripeParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
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

/** Billing portal session returned by Stripe. */
export const StripePortalSessionSchema = Schema.Struct({
  url: Schema.optional(Schema.String),
  error: Schema.optional(StripeErrorSchema),
});

/** Customer lookup used when a webhook has no local row. */
export const StripeCustomerEmailSchema = Schema.Struct({
  email: Schema.String,
});

/** Customer metadata carrying the company CRM field. */
const StripeCompanyMetadataSchema = Schema.Struct({
  company: Schema.optional(Schema.String),
});

/** Customer record from list/sync. */
const StripeCustomerSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.Union(Schema.Null, Schema.String),
  name: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  metadata: Schema.optional(StripeCompanyMetadataSchema),
});

/** Stripe subscription lifecycle states consumed by reconciliation. */
const StripeSubscriptionStatusSchema = Schema.Literal(
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);

const StripeSubscriptionItemSchema = Schema.Struct({
  price: Schema.Struct({
    id: Schema.String.pipe(Schema.minLength(1)),
  }),
  quantity: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
});

/** Current subscription record used for entitlement reconciliation and admin sync. */
export const StripeSubscriptionSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  customer: Schema.String.pipe(Schema.minLength(1)),
  status: StripeSubscriptionStatusSchema,
  current_period_end: Schema.Number,
  items: Schema.Struct({
    data: Schema.Array(StripeSubscriptionItemSchema),
  }),
});
export type StripeSubscription = Schema.Schema.Type<typeof StripeSubscriptionSchema>;

/** Invoice money/URL/period fields shared between sync records and webhook payloads. */
const StripeInvoiceFields = {
  amount_paid: Schema.optional(Schema.Number),
  currency: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
  hosted_invoice_url: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  invoice_pdf: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  period_start: Schema.optional(Schema.Number),
  period_end: Schema.optional(Schema.Number),
  created: Schema.optional(Schema.Number),
} as const;

/** Invoice record from list/sync. */
const StripeInvoiceSchema = Schema.Struct({
  id: Schema.String,
  customer: Schema.String,
  status: Schema.String,
  ...StripeInvoiceFields,
});

/** Active subscription item shape used for MRR metrics. */
const StripeMetricsItemSchema = Schema.Struct({
  price: Schema.Struct({
    unit_amount: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
    recurring: Schema.optional(
      Schema.Struct({
        interval: Schema.optional(Schema.String),
        interval_count: Schema.optional(Schema.Number),
      })
    ),
  }),
});

/** Active subscription used for MRR metrics. */
const StripeMetricsSubscriptionSchema = Schema.Struct({
  items: Schema.Struct({
    data: Schema.Array(StripeMetricsItemSchema),
  }),
});

/** One Stripe balance bucket. */
const StripeBalanceFundsSchema = Schema.Struct({
  amount: Schema.Number,
});

/** Stripe balance payload. */
export const StripeBalanceSchema = Schema.Struct({
  available: Schema.Array(StripeBalanceFundsSchema),
  pending: Schema.Array(StripeBalanceFundsSchema),
});

/** Paged Stripe customer list response. */
export const StripeCustomerListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeCustomerSchema),
});

/** Paged Stripe subscription list response. */
export const StripeSubscriptionListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeSubscriptionSchema),
});

/** Paged Stripe invoice list response. */
export const StripeInvoiceListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeInvoiceSchema),
});

/** Active-subscription list response used for MRR metrics. */
export const StripeMetricsListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(StripeMetricsSubscriptionSchema),
});

/** Signed Stripe webhook envelope. */
export const StripeWebhookEventSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  type: Schema.String.pipe(Schema.minLength(1)),
  data: Schema.Struct({
    object: Schema.Struct({
      id: Schema.optional(Schema.String),
      customer: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
      status: Schema.optional(Schema.String),
      current_period_end: Schema.optional(Schema.Number),
      amount_due: Schema.optional(Schema.Number),
      ...StripeInvoiceFields,
      name: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
      email: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
      metadata: Schema.optional(StripeCompanyMetadataSchema),
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
  value: Schema.Schema.Encoded<Schema.Schema.Any>
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
