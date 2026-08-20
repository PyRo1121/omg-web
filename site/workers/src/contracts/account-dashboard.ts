// Boundary parser internals decode D1 rows and the Worker account dashboard payload.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON/D1 boundary parsing requires these operations.

import { Effect } from 'effect';
import { Schema } from '@effect/schema';

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

/** D1 aggregate that may be SQL NULL. */
export const D1Number = Schema.Union(Schema.Number, Schema.Null).pipe(
  Schema.transform(Schema.Number, {
    decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
    encode: (toI: number) => toI,
  })
);

/** Admin flag row. */
export const AdminFlagRowSchema = Schema.Struct({
  admin: Schema.Number,
});
export type AdminFlagRow = Schema.Schema.Type<typeof AdminFlagRowSchema>;

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
export type DashboardLicenseRow = Schema.Schema.Type<typeof DashboardLicenseRowSchema>;

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
export type DashboardMachineRow = Schema.Schema.Type<typeof DashboardMachineRowSchema>;

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
export type UsageStatsRow = Schema.Schema.Type<typeof UsageStatsRowSchema>;

/** Daily usage chart row. */
export const DailyUsageRowSchema = Schema.Struct({
  date: Schema.String,
  commands_run: D1Number,
  time_saved_ms: D1Number,
});
export type DailyUsageRow = Schema.Schema.Type<typeof DailyUsageRowSchema>;

/** Unlocked achievement row. */
export const AchievementUnlockRowSchema = Schema.Struct({
  achievement_id: Schema.String,
  unlocked_at: Schema.Union(Schema.Null, Schema.String),
});
export type AchievementUnlockRow = Schema.Schema.Type<typeof AchievementUnlockRowSchema>;

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
export type SubscriptionRow = Schema.Schema.Type<typeof SubscriptionRowSchema>;

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
export type InvoiceRow = Schema.Schema.Type<typeof InvoiceRowSchema>;

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
  value: unknown
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
  value: unknown
): Effect.Effect<Schema.Schema.Type<S>, AccountDashboardParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(mapParseError(reason)));
}
