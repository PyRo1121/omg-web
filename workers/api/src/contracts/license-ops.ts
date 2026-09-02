// Boundary parser internals decode license lookup, usage reports, and analytics batches.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { OptionalCount, OptionalDurationMs } from './primitives';
import { LicenseKey } from './license-key';

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

const UsageCount = Schema.Number.pipe(Schema.int(), Schema.between(0, 1_000_000_000));
const OptionalString = Schema.optional(
  Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256))
);
const CountByName = Schema.optional(
  Schema.Record({
    key: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
    value: UsageCount,
  }).pipe(
    Schema.filter(entries => Object.keys(entries).length <= 64, {
      message: () => 'Usage dimension maps support at most 64 entries',
    })
  )
);

/** CLI usage report posted to `/api/report-usage`. */
export const ReportUsageRequestSchema = Schema.Struct({
  license_key: LicenseKey,
  machine_id: OptionalString,
  hostname: OptionalString,
  os: OptionalString,
  arch: OptionalString,
  omg_version: OptionalString,
  commands_run: OptionalCount,
  packages_installed: OptionalCount,
  packages_searched: OptionalCount,
  runtimes_switched: OptionalCount,
  sbom_generated: OptionalCount,
  vulnerabilities_found: OptionalCount,
  time_saved_ms: OptionalDurationMs,
  current_streak: OptionalCount,
  achievements: Schema.optional(
    Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64))).pipe(
      Schema.maxItems(64)
    )
  ),
  installed_packages: CountByName,
  runtime_usage_counts: CountByName,
});
export type ReportUsageRequest = Schema.Schema.Type<typeof ReportUsageRequestSchema>;

const AnalyticsPropertyValue = Schema.Union(
  Schema.String.pipe(Schema.maxLength(500)),
  Schema.Number,
  Schema.Boolean,
  Schema.Null
);

/** A single CLI analytics event. */
// Length caps bound the upsert-key cardinality of analytics_daily /
// analytics_errors: without them every request mints new aggregate rows.
const CappedKey = (max: number) => Schema.String.pipe(Schema.minLength(1), Schema.maxLength(max));

const AnalyticsEventSchema = Schema.Struct({
  event_type: CappedKey(32),
  event_name: CappedKey(128),
  properties: Schema.optional(
    Schema.Record({ key: CappedKey(64), value: AnalyticsPropertyValue }).pipe(
      Schema.filter(properties => Object.keys(properties).length <= 64, {
        message: () => 'Analytics properties support at most 64 entries',
      })
    )
  ),
  timestamp: Schema.String.pipe(Schema.maxLength(40)),
  session_id: CappedKey(64),
  machine_id: CappedKey(128),
  license_key: OptionalString,
  version: CappedKey(32),
  platform: CappedKey(32),
  duration_ms: OptionalDurationMs,
});

/** Batch envelope posted to `/api/analytics`. */
export const AnalyticsBatchSchema = Schema.Struct({
  events: Schema.optional(Schema.Array(AnalyticsEventSchema).pipe(Schema.maxItems(50))),
});
export type AnalyticsEvent = Schema.Schema.Type<typeof AnalyticsEventSchema>;

/** Public license lookup row. */
export const PublicLicenseRowSchema = Schema.Struct({
  license_key: LicenseKey,
  tier: Schema.String,
  status: Schema.String,
  expires_at: Schema.Union(Schema.Null, Schema.String),
  max_machines: Schema.Union(Schema.Null, Schema.Number),
  used_machines: Schema.Number,
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
