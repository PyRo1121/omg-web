// Boundary parser internals intentionally inspect unknown telemetry payloads.
// The narrow suppression is limited to this parser module; callers receive typed contract values.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';

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

// ============================================================================
// Branded domain primitives
// ============================================================================

/** A stable customer identifier issued by the platform. */
export const UserId = Schema.String.pipe(Schema.brand('UserId'));
export type UserId = Schema.Schema.Type<typeof UserId>;

/** A license key issued to a customer. */
export const LicenseKey = Schema.String.pipe(Schema.brand('LicenseKey'));
export type LicenseKey = Schema.Schema.Type<typeof LicenseKey>;

/** A registered machine identifier reported by the CLI. */
export const MachineId = Schema.String.pipe(Schema.brand('MachineId'));
export type MachineId = Schema.Schema.Type<typeof MachineId>;

// ============================================================================
// Telemetry dashboard response schema
// ============================================================================

/** A usage aggregation row returned by the dashboard endpoint. */
export const DailyUsageSchema = Schema.Struct({
  date: Schema.String,
  commands_run: Schema.Number,
  packages_installed: Schema.Number,
  packages_searched: Schema.Number,
  time_saved_ms: Schema.Number,
});

/** A registered machine row returned by the dashboard endpoint. */
export const MachineSchema = Schema.Struct({
  id: Schema.String,
  machine_id: MachineId,
  hostname: Schema.Union(Schema.Null, Schema.String),
  os: Schema.Union(Schema.Null, Schema.String),
  arch: Schema.Union(Schema.Null, Schema.String),
  omg_version: Schema.Union(Schema.Null, Schema.String),
  is_active: Schema.Number,
  last_seen_at: Schema.String,
});

/** An achievement progress row returned by the dashboard endpoint. */
export const AchievementSchema = Schema.Struct({
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
});

/** Optional global statistics block returned by the dashboard endpoint. */
export const GlobalStatsSchema = Schema.Struct({
  top_package: Schema.String,
  top_runtime: Schema.String,
  percentile: Schema.Number,
});

/** The full payload returned by the authenticated telemetry dashboard endpoint. */
export const TelemetryDashboardSchema = Schema.Struct({
  user: Schema.Struct({
    id: UserId,
    email: Schema.String,
    name: Schema.String,
    role: Schema.String,
  }),
  license: Schema.Struct({
    id: Schema.String,
    license_key: LicenseKey,
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
  daily: Schema.Array(DailyUsageSchema),
  machines: Schema.Array(MachineSchema),
  achievements: Schema.Array(AchievementSchema),
  global_stats: Schema.optional(GlobalStatsSchema),
});

export type TelemetryDashboard = Schema.Schema.Type<typeof TelemetryDashboardSchema>;

/**
 * Parse a telemetry dashboard payload at the network boundary.
 *
 * Used both to decode untrusted JSON from the client and to refuse emitting an
 * outbound payload that does not match the Schema.
 *
 * @param value - Untrusted JSON or a constructed server payload.
 * @returns The typed dashboard payload, or `TelemetryDashboardParseError`.
 */
export function parseTelemetryDashboard(
  value: unknown
): Effect.Effect<TelemetryDashboard, TelemetryDashboardParseError> {
  return Schema.decodeUnknown(TelemetryDashboardSchema)(value).pipe(
    Effect.mapError(
      cause =>
        new TelemetryDashboardParseError('Telemetry dashboard payload has an invalid shape', cause)
    )
  );
}

/**
 * Decode an untrusted telemetry dashboard payload at the network boundary.
 *
 * @param value - The raw JSON received from the telemetry dashboard endpoint.
 * @returns The typed dashboard payload, or `null` when the payload does not match the schema.
 */
export function decodeTelemetryDashboard(value: unknown): TelemetryDashboard | null {
  const decoded = Schema.decodeUnknownEither(TelemetryDashboardSchema)(value);
  return decoded._tag === 'Right' ? decoded.right : null;
}
