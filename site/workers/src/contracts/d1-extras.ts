// Boundary parser internals decode remaining D1 rows and provider JSON.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON/D1 boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';

/** A failure decoding a remaining D1 row or provider payload. */
export class ExtraRowParseError extends Error {
  readonly _tag = 'ExtraRowParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

const NullableNumber = Schema.Union(Schema.Null, Schema.Number);
const NullableString = Schema.Union(Schema.Null, Schema.String);
const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);
const JsonObject = Schema.Record({ key: Schema.String, value: JsonAtom });

const D1Number = Schema.Union(Schema.Number, Schema.Null).pipe(
  Schema.transform(Schema.Number, {
    decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
    encode: (toI: number) => toI,
  })
);

/** Firehose analytics event row. */
export const FirehoseEventRowSchema = Schema.Struct({
  id: Schema.String,
  event_type: Schema.String,
  event_name: Schema.String,
  properties: Schema.optional(NullableString),
  timestamp: Schema.String,
  session_id: Schema.String,
  machine_id: Schema.String,
  version: Schema.String,
  platform: Schema.String,
  duration_ms: Schema.optional(NullableNumber),
  created_at: Schema.String,
});
export type FirehoseEventRow = Schema.Schema.Type<typeof FirehoseEventRowSchema>;

/** Insights error aggregate row. */
export const InsightsErrorRowSchema = Schema.Struct({
  error_message: Schema.String,
  occurrences: D1Number,
});
export type InsightsErrorRow = Schema.Schema.Type<typeof InsightsErrorRowSchema>;

/** Privacy export license row. */
export const PrivacyLicenseRowSchema = Schema.Struct({
  tier: Schema.String,
  status: Schema.String,
  max_machines: Schema.optional(NullableNumber),
  activated_at: Schema.optional(NullableString),
  expires_at: Schema.optional(NullableString),
  created_at: Schema.String,
});
export type PrivacyLicenseRow = Schema.Schema.Type<typeof PrivacyLicenseRowSchema>;

/** Id-only lookup row. */
export const IdRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
});
export type IdRow = Schema.Schema.Type<typeof IdRowSchema>;

/** License id + customer id lookup. */
export const LicenseCustomerIdRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  customer_id: Schema.String.pipe(Schema.minLength(1)),
});
export type LicenseCustomerIdRow = Schema.Schema.Type<typeof LicenseCustomerIdRowSchema>;

/** Docs analytics daily pageview totals. */
export const DocsPageviewsRowSchema = Schema.Struct({
  date: Schema.optional(Schema.String),
  views: D1Number,
  sessions: D1Number,
});
export type DocsPageviewsRow = Schema.Schema.Type<typeof DocsPageviewsRowSchema>;

/** Admin usage CSV row. */
export const UsageCsvRowSchema = Schema.Struct({
  date: Schema.optional(NullableString),
  license_id: Schema.optional(NullableString),
  commands_run: Schema.optional(NullableNumber),
  time_saved_ms: Schema.optional(NullableNumber),
});
export type UsageCsvRow = Schema.Schema.Type<typeof UsageCsvRowSchema>;

/** Admin audit CSV row. */
export const AuditCsvRowSchema = Schema.Struct({
  created_at: Schema.optional(NullableString),
  action: Schema.optional(NullableString),
  customer_id: Schema.optional(NullableString),
  ip_address: Schema.optional(NullableString),
});
export type AuditCsvRow = Schema.Schema.Type<typeof AuditCsvRowSchema>;

/** Meta.com chat completion. */
export const MetaChatCompletionSchema = Schema.Struct({
  choices: Schema.optional(
    Schema.Array(
      Schema.Struct({
        message: Schema.optional(
          Schema.Struct({
            content: Schema.optional(Schema.String),
          })
        ),
      })
    )
  ),
});
export type MetaChatCompletion = Schema.Schema.Type<typeof MetaChatCompletionSchema>;

/** Workers AI text response for the Llama instruct model. */
export const WorkersAiTextSchema = Schema.Struct({
  response: Schema.optional(Schema.String),
});
export type WorkersAiText = Schema.Schema.Type<typeof WorkersAiTextSchema>;

/** COUNT(*) / COUNT(DISTINCT ...) aggregate. */
export const CountRowSchema = Schema.Struct({
  count: D1Number,
});
export type CountRow = Schema.Schema.Type<typeof CountRowSchema>;

/** Admin overview COUNT aggregates. */
export const AdminCountsRowSchema = Schema.Struct({
  total_users: D1Number,
  active_licenses: D1Number,
  active_machines: D1Number,
  total_installs: D1Number,
});
export type AdminCountsRow = Schema.Schema.Type<typeof AdminCountsRowSchema>;

/** Admin usage SUM aggregates. */
export const AdminUsageTotalsRowSchema = Schema.Struct({
  total_commands: D1Number,
  total_packages_installed: D1Number,
  total_searches: D1Number,
  total_time_saved_ms: D1Number,
});
export type AdminUsageTotalsRow = Schema.Schema.Type<typeof AdminUsageTotalsRowSchema>;

/** Global time-saved aggregate. */
export const GlobalUsageRowSchema = Schema.Struct({
  total_time_saved: D1Number,
});
export type GlobalUsageRow = Schema.Schema.Type<typeof GlobalUsageRowSchema>;

/** Success/failure command aggregates. */
export const CommandStatsRowSchema = Schema.Struct({
  success: D1Number,
  failure: D1Number,
});
export type CommandStatsRow = Schema.Schema.Type<typeof CommandStatsRowSchema>;

/** License-tier count row. */
export const TierCountRowSchema = Schema.Struct({
  tier: Schema.String,
  count: D1Number,
});
export type TierCountRow = Schema.Schema.Type<typeof TierCountRowSchema>;

/** Current MRR aggregate. */
export const CurrentMrrRowSchema = Schema.Struct({
  current_mrr: D1Number,
});
export type CurrentMrrRow = Schema.Schema.Type<typeof CurrentMrrRowSchema>;

/** Stripe customer id selected for the billing portal. */
export const StripeCustomerIdRowSchema = Schema.Struct({
  stripe_customer_id: Schema.String.pipe(Schema.minLength(1)),
});
export type StripeCustomerIdRow = Schema.Schema.Type<typeof StripeCustomerIdRowSchema>;

/** Privacy status license/customer join. */
export const PrivacyStatusRowSchema = Schema.Struct({
  telemetry_opt_out: Schema.optional(Schema.Union(Schema.Number, Schema.Boolean)),
  email: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
});
export type PrivacyStatusRow = Schema.Schema.Type<typeof PrivacyStatusRowSchema>;

/** Public installs badge COUNT. */
export const InstallsBadgeRowSchema = Schema.Struct({
  total: D1Number,
});
export type InstallsBadgeRow = Schema.Schema.Type<typeof InstallsBadgeRowSchema>;

/** Session + customer join used by Bearer validation. */
export const SessionJoinRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  token: Schema.String.pipe(Schema.minLength(1)),
  expires_at: Schema.String.pipe(Schema.minLength(1)),
  customer_id: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String.pipe(Schema.minLength(1)),
  company: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  stripe_customer_id: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  customer_created_at: Schema.String.pipe(Schema.minLength(1)),
});
export type SessionJoinRow = Schema.Schema.Type<typeof SessionJoinRowSchema>;

/** Site analytics salt BLOB. */
export const AnalyticsSaltRowSchema = Schema.Struct({
  salt: Schema.Union(Schema.instanceOf(ArrayBuffer), Schema.instanceOf(Uint8Array)),
});
export type AnalyticsSaltRow = Schema.Schema.Type<typeof AnalyticsSaltRowSchema>;

/** Site analytics overview SUM aggregates. */
export const SiteAnalyticsTotalsRowSchema = Schema.Struct({
  total_pageviews: D1Number,
  total_visitors: D1Number,
  total_sessions: D1Number,
});
export type SiteAnalyticsTotalsRow = Schema.Schema.Type<typeof SiteAnalyticsTotalsRowSchema>;

/**
 * Decode stored firehose properties JSON.
 *
 * @param value - Persisted JSON text.
 * @returns A primitive record, or an empty object.
 */
export function decodeStoredProperties(
  value: string | null | undefined
): Readonly<Record<string, string | number | boolean | null>> {
  if (value === null || value === undefined || value.length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {};
  }
  const decoded = Schema.decodeUnknownEither(JsonObject)(parsed);
  return decoded._tag === 'Right' ? decoded.right : {};
}

/**
 * Decode a remaining D1 row or provider payload.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - Raw value.
 * @returns The typed value, or `ExtraRowParseError`.
 */
export function decodeExtraRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<Schema.Schema.Type<S>, ExtraRowParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause: unknown): ExtraRowParseError => new ExtraRowParseError(reason, cause))
  );
}

/**
 * Decode an array of remaining D1 rows.
 *
 * @param schema - Item schema.
 * @param reason - Parse error reason.
 * @param value - The `results` array.
 * @returns Typed items, or `ExtraRowParseError`.
 */
export function decodeExtraRowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, ExtraRowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed([]);
  }
  if (!Array.isArray(value)) {
    return Effect.fail(new ExtraRowParseError(reason));
  }
  return Effect.forEach(value, row => decodeExtraRow(schema, reason, row));
}

/**
 * Decode a single optional D1 `.first()` row, returning undefined when the shape is wrong.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The `.first()` result.
 * @returns The typed row, or undefined.
 */
export function decodeOptionalExtraRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: unknown
): Effect.Effect<Schema.Schema.Type<S> | undefined> {
  return decodeExtraRow(schema, reason, value).pipe(Effect.orElseSucceed(() => undefined));
}
