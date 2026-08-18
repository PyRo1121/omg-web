// Boundary parser internals decode the Worker licensing dashboard JSON payload.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';

/** A failure decoding the Worker licensing dashboard payload. */
export class WorkerDashboardParseError extends Error {
  readonly _tag = 'WorkerDashboardParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

const NullableString = Schema.Union(Schema.Null, Schema.String);

/** Payload returned by Worker `GET /api/dashboard`. */
export const WorkerDashboardDataSchema = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String.pipe(Schema.minLength(1)),
    email: Schema.String,
    name: NullableString,
    avatar_url: NullableString,
    created_at: Schema.String,
  }),
  license: Schema.Struct({
    id: Schema.String.pipe(Schema.minLength(1)),
    license_key: Schema.String.pipe(Schema.minLength(1)),
    tier: Schema.String,
    status: Schema.String,
    max_machines: Schema.Number,
    expires_at: NullableString,
    features: Schema.Array(Schema.String),
  }),
  machines: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      machine_id: Schema.String,
      hostname: NullableString,
      os: NullableString,
      arch: NullableString,
      omg_version: NullableString,
      last_seen_at: Schema.String,
      first_seen_at: Schema.String,
      is_active: Schema.Number,
    })
  ),
  usage: Schema.Struct({
    total_commands: Schema.Number,
    total_packages_installed: Schema.Number,
    total_packages_searched: Schema.Number,
    total_runtimes_switched: Schema.Number,
    total_sbom_generated: Schema.Number,
    total_vulnerabilities_found: Schema.Number,
    total_time_saved_ms: Schema.Number,
    current_streak: Schema.Number,
    longest_streak: Schema.Number,
    daily: Schema.Array(
      Schema.Struct({
        date: Schema.String,
        commands_run: Schema.Number,
        time_saved_ms: Schema.Number,
      })
    ),
    breakdown: Schema.Struct({
      installed: Schema.Number,
      searched: Schema.Number,
      switched: Schema.Number,
      sbom: Schema.Number,
      vulns: Schema.Number,
    }),
  }),
  achievements: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      emoji: Schema.String,
      name: Schema.String,
      description: Schema.String,
      unlocked: Schema.Boolean,
      unlocked_at: Schema.optional(NullableString),
    })
  ),
  subscription: Schema.Union(
    Schema.Null,
    Schema.Struct({
      status: Schema.String,
      current_period_start: NullableString,
      current_period_end: NullableString,
      cancel_at_period_end: Schema.Number,
    })
  ),
  invoices: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      amount_cents: Schema.Number,
      currency: Schema.String,
      status: NullableString,
      invoice_url: NullableString,
      invoice_pdf: NullableString,
      period_start: NullableString,
      period_end: NullableString,
      created_at: Schema.String,
    })
  ),
  is_admin: Schema.Boolean,
  leaderboard: Schema.Array(
    Schema.Struct({
      user: Schema.String,
      time_saved: Schema.Number,
    })
  ),
  global_stats: Schema.Struct({
    top_package: Schema.String,
    top_runtime: Schema.String,
    percentile: Schema.Number,
  }),
});

export type WorkerDashboardData = Schema.Schema.Type<typeof WorkerDashboardDataSchema>;

/**
 * Decode an untrusted Worker licensing dashboard payload.
 *
 * @param value - Raw JSON from `GET /api/dashboard`.
 * @returns The typed dashboard, or `WorkerDashboardParseError`.
 */
export function decodeWorkerDashboard(
  value: unknown
): Effect.Effect<WorkerDashboardData, WorkerDashboardParseError> {
  return Schema.decodeUnknown(WorkerDashboardDataSchema)(value).pipe(
    Effect.mapError(
      cause =>
        new WorkerDashboardParseError('Worker dashboard response has an invalid shape', cause)
    )
  );
}
