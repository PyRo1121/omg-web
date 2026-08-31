// Boundary parser internals intentionally inspect unknown telemetry payloads.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { LicensingGlobalStatsSchema } from '../../../../shared/licensing-dashboard';

/** A failure decoding or encoding a telemetry dashboard payload. */
export class TelemetryDashboardParseError extends Error {
  readonly _tag = 'TelemetryDashboardParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const TelemetryDashboardSchema = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String.pipe(Schema.brand('UserId')),
    email: Schema.String,
    name: Schema.String,
    role: Schema.String,
  }),
  license: Schema.Struct({
    id: Schema.String,
    license_key: Schema.String.pipe(Schema.brand('LicenseKey')),
    tier: Schema.String,
    status: Schema.String,
    max_machines: Schema.Number,
    expires_at: Schema.Union(Schema.Null, Schema.String),
    features: Schema.Array(Schema.String),
  }),
  usage: Schema.Struct({
    total_commands: Schema.Number,
    total_packages_installed: Schema.Number,
    total_packages_searched: Schema.Number,
    total_runtimes_switched: Schema.Number,
    total_sbom_generated: Schema.Number,
    total_vulnerabilities_found: Schema.Number,
    total_time_saved_ms: Schema.Number,
    commands_trend: Schema.optional(Schema.Number),
    time_saved_trend: Schema.optional(Schema.Number),
  }),
  daily: Schema.Array(
    Schema.Struct({
      date: Schema.String,
      commands_run: Schema.Number,
      packages_installed: Schema.Number,
      packages_searched: Schema.Number,
      time_saved_ms: Schema.Number,
    })
  ),
  machines: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      machine_id: Schema.String.pipe(Schema.brand('MachineId')),
      hostname: Schema.Union(Schema.Null, Schema.String),
      os: Schema.Union(Schema.Null, Schema.String),
      arch: Schema.Union(Schema.Null, Schema.String),
      omg_version: Schema.Union(Schema.Null, Schema.String),
      is_active: Schema.Number,
      last_seen_at: Schema.String,
    })
  ),
  achievements: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      achievement_id: Schema.String,
      name: Schema.String,
      description: Schema.String,
      icon: Schema.String,
      category: Schema.String,
      points: Schema.Number,
      progress: Schema.Number,
      unlocked: Schema.Boolean,
      unlocked_at: Schema.Union(Schema.Null, Schema.String),
    })
  ),
  global_stats: Schema.optional(LicensingGlobalStatsSchema),
});

export type TelemetryDashboard = Schema.Schema.Type<typeof TelemetryDashboardSchema>;

/** Parse a telemetry dashboard payload at the network boundary. */
export function parseTelemetryDashboard(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<TelemetryDashboard, TelemetryDashboardParseError> {
  return Schema.decodeUnknown(TelemetryDashboardSchema)(value).pipe(
    Effect.mapError(
      cause =>
        new TelemetryDashboardParseError('Telemetry dashboard payload has an invalid shape', cause)
    )
  );
}

/** Decode an untrusted telemetry dashboard payload, returning `null` when invalid. */
export function decodeTelemetryDashboard(
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): TelemetryDashboard | null {
  const decoded = Schema.decodeUnknownEither(TelemetryDashboardSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
