// Boundary parser internals decode license lookup, usage reports, and analytics batches.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { LicenseKey } from './license-key';

export { LicenseKey };

/** A failure decoding a license-ops payload or D1 row. */
export class LicenseOpsParseError extends Error {
  readonly _tag = 'LicenseOpsParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const OptionalNumber = Schema.optional(Schema.Number);
const OptionalString = Schema.optional(Schema.String);
const CountByName = Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Number }));

/** CLI usage report posted to `/api/report-usage`. */
export const ReportUsageRequestSchema = Schema.Struct({
  license_key: LicenseKey,
  machine_id: OptionalString,
  hostname: OptionalString,
  os: OptionalString,
  arch: OptionalString,
  omg_version: OptionalString,
  commands_run: OptionalNumber,
  packages_installed: OptionalNumber,
  packages_searched: OptionalNumber,
  runtimes_switched: OptionalNumber,
  sbom_generated: OptionalNumber,
  vulnerabilities_found: OptionalNumber,
  time_saved_ms: OptionalNumber,
  current_streak: OptionalNumber,
  achievements: Schema.optional(Schema.Array(Schema.String.pipe(Schema.minLength(1)))),
  installed_packages: CountByName,
  runtime_usage_counts: CountByName,
});
export type ReportUsageRequest = Schema.Schema.Type<typeof ReportUsageRequestSchema>;

const AnalyticsPropertyValue = Schema.Union(
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null
);

/** A single CLI analytics event. */
export const AnalyticsEventSchema = Schema.Struct({
  event_type: Schema.String.pipe(Schema.minLength(1)),
  event_name: Schema.String.pipe(Schema.minLength(1)),
  properties: Schema.optional(Schema.Record({ key: Schema.String, value: AnalyticsPropertyValue })),
  timestamp: Schema.String.pipe(Schema.minLength(1)),
  session_id: Schema.String.pipe(Schema.minLength(1)),
  machine_id: Schema.String.pipe(Schema.minLength(1)),
  license_key: OptionalString,
  version: Schema.String.pipe(Schema.minLength(1)),
  platform: Schema.String.pipe(Schema.minLength(1)),
  duration_ms: OptionalNumber,
});

/** Batch envelope posted to `/api/analytics`. */
export const AnalyticsBatchSchema = Schema.Struct({
  events: Schema.optional(Schema.Array(AnalyticsEventSchema).pipe(Schema.maxItems(50))),
});
export type AnalyticsBatch = Schema.Schema.Type<typeof AnalyticsBatchSchema>;
export type AnalyticsEvent = Schema.Schema.Type<typeof AnalyticsEventSchema>;

/** Public license lookup row. */
export const PublicLicenseRowSchema = Schema.Struct({
  license_key: LicenseKey,
  tier: Schema.String,
  status: Schema.String,
  expires_at: Schema.Union(Schema.Null, Schema.String),
  max_machines: Schema.Union(Schema.Null, Schema.Number),
});

/** COUNT(*) row. */
export const CountRowSchema = Schema.Struct({
  count: Schema.Union(Schema.Number, Schema.Null).pipe(
    Schema.transform(Schema.Number, {
      decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
      encode: (toI: number) => toI,
    })
  ),
});

function mapParseError(reason: string) {
  return (cause: unknown): LicenseOpsParseError => new LicenseOpsParseError(reason, cause);
}

/**
 * Decode a D1 row against a schema.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The D1 result.
 * @returns The typed row, or `LicenseOpsParseError`.
 */
export function decodeLicenseOpsRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<Schema.Schema.Type<S>, LicenseOpsParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(mapParseError(reason)));
}
