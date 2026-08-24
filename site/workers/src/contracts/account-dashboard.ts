// Boundary parser internals decode D1 rows and the Worker account dashboard payload.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { D1Number } from '../../../shared/d1-rows';
import { AdminFlagRowSchema } from './d1-extras';

/** Shared persisted-row primitives used by account-dashboard consumers. */
export { AdminFlagRowSchema, D1Number };

/** A failure decoding a Worker account dashboard payload or D1 row. */
export class AccountDashboardParseError extends Error {
  readonly _tag = 'AccountDashboardParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** License columns required by the account dashboard. */
export const DashboardLicenseRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  license_key: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
  status: Schema.String,
  max_seats: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  max_machines: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  expires_at: Schema.Union(Schema.Null, Schema.String),
});

/** Active machine row. */
export const DashboardMachineRowSchema = Schema.Struct({
  id: Schema.String,
  machine_id: Schema.String,
  hostname: Schema.Union(Schema.Null, Schema.String),
  os: Schema.Union(Schema.Null, Schema.String),
  arch: Schema.Union(Schema.Null, Schema.String),
  omg_version: Schema.Union(Schema.Null, Schema.String),
  last_seen_at: Schema.String,
  first_seen_at: Schema.String,
  is_active: Schema.Number,
});

/** 30-day usage aggregate. */
export const UsageStatsRowSchema = Schema.Struct({
  total_commands: D1Number,
  total_packages_installed: D1Number,
  total_packages_searched: D1Number,
  total_runtimes_switched: D1Number,
  total_sbom_generated: D1Number,
  total_vulnerabilities_found: D1Number,
  total_time_saved_ms: D1Number,
});

/** Daily usage chart row. */
export const DailyUsageRowSchema = Schema.Struct({
  date: Schema.String,
  commands_run: D1Number,
  time_saved_ms: D1Number,
});

/** Unlocked achievement row. */
export const AchievementUnlockRowSchema = Schema.Struct({
  achievement_id: Schema.String,
  unlocked_at: Schema.Union(Schema.Null, Schema.String),
});

/** Streak date row. */
export const StreakDateRowSchema = Schema.Struct({
  date: Schema.String,
});

/** Command-breakdown daily row. */
export const CommandBreakdownRowSchema = Schema.Struct({
  packages_installed: D1Number,
  packages_searched: D1Number,
  runtimes_switched: D1Number,
  sbom_generated: D1Number,
  vulnerabilities_found: D1Number,
});

/** Subscription row. */
export const SubscriptionRowSchema = Schema.Struct({
  status: Schema.String,
  current_period_start: Schema.Union(Schema.Null, Schema.String),
  current_period_end: Schema.Union(Schema.Null, Schema.String),
  cancel_at_period_end: D1Number,
});

/** Invoice row. */
export const InvoiceRowSchema = Schema.Struct({
  id: Schema.String,
  amount_cents: D1Number,
  currency: Schema.String,
  status: Schema.Union(Schema.Null, Schema.String),
  invoice_url: Schema.Union(Schema.Null, Schema.String),
  invoice_pdf: Schema.Union(Schema.Null, Schema.String),
  period_start: Schema.Union(Schema.Null, Schema.String),
  period_end: Schema.Union(Schema.Null, Schema.String),
  created_at: Schema.String,
});

/** Leaderboard row. */
export const LeaderboardRowSchema = Schema.Struct({
  user: Schema.String,
  time_saved: D1Number,
});

/** Top package analytics row. */
export const TopPackageRowSchema = Schema.Struct({
  package_name: Schema.String,
});

/** Top runtime analytics row. */
export const TopRuntimeRowSchema = Schema.Struct({
  dimension: Schema.String,
});

/** Percentile rank row. */
export const BetterUsersRowSchema = Schema.Struct({
  better_users: D1Number,
});

/** Distinct license count row. */
export const DistinctCountRowSchema = Schema.Struct({
  count: D1Number,
});

function mapParseError(reason: string) {
  return (cause: unknown): AccountDashboardParseError =>
    new AccountDashboardParseError(reason, cause);
}

/**
 * Decode a D1 `.all().results` array against an item schema.
 *
 * @param schema - Item schema.
 * @param reason - Parse error reason.
 * @param value - The `results` array, which may be missing.
 * @returns Typed items, or `AccountDashboardParseError`.
 */
export function decodeRowArray<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, AccountDashboardParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed([]);
  }
  if (!Array.isArray(value)) {
    return Effect.fail(new AccountDashboardParseError(reason));
  }
  return Effect.forEach(value, row => decodeRow(schema, reason, row));
}

/**
 * Decode a single D1 row.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The `.first()` result.
 * @returns The typed row, or `AccountDashboardParseError`.
 */
export function decodeRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<Schema.Schema.Type<S>, AccountDashboardParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(mapParseError(reason)));
}
