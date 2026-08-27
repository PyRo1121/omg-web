// Boundary parser internals decode remaining D1 rows and provider JSON.

import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';

import { CountRowSchema, D1Number, IdRowSchema } from '../../../shared/d1-rows';

export { CountRowSchema, IdRowSchema };

/** A failure decoding a remaining D1 row or provider payload. */
export class ExtraRowParseError extends Error {
  readonly _tag = 'ExtraRowParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const NullableNumber = Schema.Union(Schema.Number, Schema.Null);
const NullableString = Schema.Union(Schema.Null, Schema.String);
const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);
const JsonObject = Schema.Record({ key: Schema.String, value: JsonAtom });

const OptNullNum = Schema.optional(NullableNumber);
const OptNullStr = Schema.optional(NullableString);
const NonEmptyStr = Schema.String.pipe(Schema.minLength(1));
const NullNonEmptyStr = Schema.Union(Schema.Null, NonEmptyStr);

/**
 * Row with caller-supplied leading fields plus a trailing `count` D1 aggregate.
 *
 * @param fields - The dimension fields preceding `count`.
 * @returns A row schema shaped `{ ...fields, count }`.
 */
const withCount = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Struct({ ...fields, count: D1Number });

/** Firehose analytics event row. */
export const FirehoseEventRowSchema = Schema.Struct({
  id: Schema.String,
  event_type: Schema.String,
  event_name: Schema.String,
  properties: OptNullStr,
  timestamp: Schema.String,
  session_id: Schema.String,
  machine_id: Schema.String,
  version: Schema.String,
  platform: Schema.String,
  duration_ms: OptNullNum,
  created_at: Schema.String,
});

/** Privacy export license row. */
export const PrivacyLicenseRowSchema = Schema.Struct({
  tier: Schema.String,
  status: Schema.String,
  max_machines: OptNullNum,
  activated_at: OptNullStr,
  expires_at: OptNullStr,
  created_at: Schema.String,
});

/** Privacy export machine_usage row. Nulls are preserved. */
export const PrivacyMachineRowSchema = Schema.Struct({
  machine_id: Schema.String,
  hostname: OptNullStr,
  os: OptNullStr,
  arch: OptNullStr,
  omg_version: OptNullStr,
  activated_at: OptNullStr,
  last_seen_at: OptNullStr,
});

/** Privacy export command_event row. Nulls are preserved. */
export const PrivacyCommandRowSchema = Schema.Struct({
  command: Schema.String,
  subcommand: OptNullStr,
  packages: OptNullStr,
  duration_ms: OptNullNum,
  success: OptNullNum,
  timestamp: Schema.String,
});

/** Privacy export session row. Nulls are preserved. */
export const PrivacySessionRowSchema = Schema.Struct({
  session_id: Schema.String,
  event_type: Schema.String,
  start_time: OptNullStr,
  end_time: OptNullStr,
  commands_run: OptNullNum,
  duration_secs: OptNullNum,
  timestamp: Schema.String,
});

/** Privacy export performance aggregate. */
export const PrivacyPerformanceRowSchema = Schema.Struct({
  metric_type: Schema.String,
  avg_duration_ms: OptNullNum,
  sample_count: D1Number,
});

/** Privacy export feature_usage aggregate. */
export const PrivacyFeatureRowSchema = Schema.Struct({
  feature: Schema.String,
  enabled: Schema.Number,
  usage_count: D1Number,
  last_used: OptNullStr,
});

/** usage_daily chart row for the dashboard team view. */
export const UsageDailyRowSchema = Schema.Struct({
  date: Schema.String,
  commands_run: D1Number,
  time_saved_ms: D1Number,
});

/** Dashboard audit log list row. */
export const DashboardAuditLogRowSchema = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  resource_type: OptNullStr,
  resource_id: OptNullStr,
  ip_address: OptNullStr,
  created_at: Schema.String,
});

/** Team-controls policy row. */
export const PolicyRowSchema = Schema.Struct({
  id: Schema.String,
  scope: Schema.String,
  rule: Schema.String,
  value: Schema.String,
  enforced: Schema.Number,
  created_at: Schema.String,
});

/** Team-controls member machine rollup. */
export const TeamControlMemberRowSchema = Schema.Struct({
  machine_id: Schema.String,
  hostname: OptNullStr,
  os: OptNullStr,
  arch: OptNullStr,
  omg_version: OptNullStr,
  last_seen_at: OptNullStr,
  first_seen_at: OptNullStr,
  is_active: Schema.optional(Schema.Number),
  total_commands: D1Number,
  total_time_saved_ms: D1Number,
  commands_last_7d: D1Number,
});

/** Docs analytics daily pageview totals. */
export const DocsPageviewsRowSchema = Schema.Struct({
  date: Schema.optional(Schema.String),
  views: D1Number,
  sessions: D1Number,
});

/** Site analytics geo rollup. */
export const SiteGeoRowSchema = Schema.Struct({
  country_code: Schema.String,
  visitors: D1Number,
  sessions: D1Number,
  pageviews: D1Number,
});

/** Docs analytics geo rollup. */
export const DocsGeoRowSchema = Schema.Struct({
  country_code: Schema.String,
  sessions: D1Number,
  pageviews: D1Number,
});

/** CLI install geo count from audit metadata. */
export const CliGeoRowSchema = withCount({ country_code: Schema.String });

/** Realtime visitors by country. */
export const SiteRealtimeCountryRowSchema = withCount({ country_code: OptNullStr });

/** Realtime visitors by page. */
export const SiteRealtimePageRowSchema = withCount({ page_path: OptNullStr });

/** Site analytics daily trend. */
export const SiteDailyTrendRowSchema = Schema.Struct({
  date: OptNullStr,
  pageviews: D1Number,
  visitors: D1Number,
});

/** Site analytics top page. */
export const SiteTopPageRowSchema = Schema.Struct({
  path: OptNullStr,
  views: D1Number,
  visitors: D1Number,
});

/** Site analytics referrer rollup. */
export const SiteReferrerRowSchema = Schema.Struct({
  referrer_domain: OptNullStr,
  visitors: D1Number,
  pageviews: D1Number,
});

/** Site analytics device rollup. */
export const SiteDeviceRowSchema = Schema.Struct({ device_type: OptNullStr, visitors: D1Number });

/** Docs analytics top page. */
export const DocsTopPageRowSchema = Schema.Struct({
  path: OptNullStr,
  views: D1Number,
  sessions: D1Number,
  avg_time: D1Number,
});

/** Docs analytics referrer rollup. */
export const DocsReferrerRowSchema = Schema.Struct({
  referrer: OptNullStr,
  sessions: D1Number,
  pageviews: D1Number,
});

/** Docs analytics UTM campaign rollup. */
export const DocsUtmRowSchema = Schema.Struct({
  utm_source: OptNullStr,
  utm_medium: OptNullStr,
  utm_campaign: OptNullStr,
  sessions: D1Number,
  pageviews: D1Number,
});

/** Docs analytics interaction rollup. */
export const DocsInteractionRowSchema = withCount({
  interaction_type: OptNullStr,
  target: OptNullStr,
});

/** Docs analytics performance rollup. */
export const DocsPerformanceRowSchema = Schema.Struct({
  path: OptNullStr,
  avg_load: D1Number,
  p95_load: D1Number,
  samples: D1Number,
});

/** Admin usage CSV row. */
export const UsageCsvRowSchema = Schema.Struct({
  date: OptNullStr,
  license_id: OptNullStr,
  commands_run: OptNullNum,
  time_saved_ms: OptNullNum,
});

/** Admin audit CSV row. */
export const AuditCsvRowSchema = Schema.Struct({
  created_at: OptNullStr,
  action: OptNullStr,
  customer_id: OptNullStr,
  ip_address: OptNullStr,
});

/** Admin overview COUNT aggregates. */
export const AdminCountsRowSchema = Schema.Struct({
  total_users: D1Number,
  active_licenses: D1Number,
  active_machines: D1Number,
  total_installs: D1Number,
});

/** Admin usage SUM aggregates. */
export const AdminUsageTotalsRowSchema = Schema.Struct({
  total_commands: D1Number,
  total_packages_installed: D1Number,
  total_searches: D1Number,
  total_time_saved_ms: D1Number,
});

/** Global time-saved aggregate. */
export const GlobalUsageRowSchema = Schema.Struct({ total_time_saved: D1Number });

/** Success/failure command aggregates. */
export const CommandStatsRowSchema = Schema.Struct({ success: D1Number, failure: D1Number });

/** License-tier count row. */
export const TierCountRowSchema = withCount({ tier: Schema.String });

/** Admin dashboard DAU-by-date row. */
export const AdminDailyActiveRowSchema = Schema.Struct({
  date: Schema.String,
  active_users: D1Number,
  commands: D1Number,
});

/** Admin dashboard signups-by-date row. */
export const AdminDateCountRowSchema = withCount({ date: OptNullStr });

/** Admin install counts by platform. */
export const AdminPlatformCountRowSchema = withCount({ platform: OptNullStr });

/** Admin install counts by version. */
export const AdminVersionCountRowSchema = withCount({ version: OptNullStr });

/** Admin subscription counts by status. */
export const AdminStatusCountRowSchema = withCount({ status: OptNullStr });

/** Admin fleet counts by CLI version. */
export const AdminFleetVersionRowSchema = withCount({ omg_version: OptNullStr });

/** Admin geo dimension count. */
export const AdminGeoDimensionRowSchema = withCount({ dimension: OptNullStr });

/** Admin analytics command aggregate. */
export const AdminCommandCountRowSchema = withCount({ command: OptNullStr });

/** Admin analytics error aggregate. */
export const AdminErrorTypeCountRowSchema = withCount({ error_type: OptNullStr });

/** Admin analytics runtime usage aggregate. */
export const AdminRuntimeUsageRowSchema = Schema.Struct({
  runtime: OptNullStr,
  count: D1Number,
  machines: D1Number,
});

/** Admin cohort retention cell. */
export const AdminCohortRowSchema = Schema.Struct({
  cohort_month: OptNullStr,
  month_index: D1Number,
  active_users: D1Number,
});

/** Admin paid-invoice monthly rollup. */
export const AdminMonthlyRevenueRowSchema = Schema.Struct({
  month: OptNullStr,
  revenue: D1Number,
  transactions: D1Number,
});

/** Admin paid-invoice rollup by license tier. */
export const AdminRevenueByTierRowSchema = Schema.Struct({
  tier: OptNullStr,
  total_revenue: D1Number,
  customers: D1Number,
});

/** Admin weekly retention cell. */
export const AdminRetentionCohortRowSchema = Schema.Struct({
  cohort_date: OptNullStr,
  week_number: D1Number,
  retained_users: D1Number,
});

/** Admin average LTV by license tier. */
export const AdminLtvByTierRowSchema = Schema.Struct({
  tier: OptNullStr,
  customer_count: D1Number,
  avg_ltv: D1Number,
});

/** Admin command events by hour and weekday. */
export const AdminCommandHeatmapRowSchema = Schema.Struct({
  hour: OptNullStr,
  day_of_week: OptNullStr,
  event_count: D1Number,
});

/** Admin runtime adoption aggregate. */
export const AdminRuntimeAdoptionRowSchema = Schema.Struct({
  runtime: OptNullStr,
  unique_users: D1Number,
  total_uses: D1Number,
});

/** Admin per-license churn-risk classification. */
export const AdminChurnRiskSegmentRowSchema = Schema.Struct({
  tier: OptNullStr,
  user_count: D1Number,
  risk_segment: Schema.String,
});

/** Admin expansion/upsell candidate. */
export const AdminExpansionOpportunityRowSchema = Schema.Struct({
  email: OptNullStr,
  tier: OptNullStr,
  active_machines: D1Number,
  total_commands_30d: D1Number,
  opportunity_type: OptNullStr,
  priority: Schema.String,
});

/** Current MRR aggregate. */
export const CurrentMrrRowSchema = Schema.Struct({ current_mrr: D1Number });

/** Persisted Stripe webhook inbox state. */
export const StripeEventStateRowSchema = Schema.Struct({
  status: Schema.Literal('received', 'processing', 'processed', 'failed', 'dead'),
  processed: Schema.Number,
});

/** Nullable Stripe customer id selected for the billing portal. */
export const StripeCustomerIdRowSchema = Schema.Struct({
  stripe_customer_id: NullNonEmptyStr,
});

/** Privacy status license/customer join. */
export const PrivacyStatusRowSchema = Schema.Struct({
  telemetry_opt_out: Schema.optional(Schema.Union(Schema.Number, Schema.Boolean)),
  email: OptNullStr,
});

/** Public installs badge COUNT. */
export const InstallsBadgeRowSchema = Schema.Struct({ total: D1Number });

/** Session + customer join used by Bearer validation. */
export const SessionJoinRowSchema = Schema.Struct({
  id: NonEmptyStr,
  token_hash: NullNonEmptyStr,
  expires_at: NonEmptyStr,
  customer_id: NonEmptyStr,
  email: NonEmptyStr,
  company: OptNullStr,
  stripe_customer_id: OptNullStr,
  customer_created_at: NonEmptyStr,
});

/**
 * D1 BLOB bytes across transports: production workerd returns an ArrayBuffer,
 * the Vitest pool bridge returns a plain number array.
 */
const SaltBytes = Schema.Union(
  Schema.instanceOf(ArrayBuffer),
  Schema.instanceOf(Uint8Array),
  Schema.Array(Schema.Number)
).pipe(
  Schema.transform(Schema.instanceOf(Uint8Array), {
    strict: false,
    decode: fromA => {
      if (fromA instanceof ArrayBuffer) {
        return new Uint8Array(fromA);
      }
      if (fromA instanceof Uint8Array) {
        return fromA;
      }
      return new Uint8Array(fromA);
    },
    encode: toI => toI,
  })
);

/** Site analytics salt BLOB row. */
export const AnalyticsSaltRowSchema = Schema.Struct({ salt: SaltBytes });

/** Site analytics overview SUM aggregates. */
export const SiteAnalyticsTotalsRowSchema = Schema.Struct({
  total_pageviews: D1Number,
  total_visitors: D1Number,
  total_sessions: D1Number,
});

/** Active license id and tier. */
export const LicenseIdTierRowSchema = Schema.Struct({ id: NonEmptyStr, tier: Schema.String });

/** Active license row that also carries seat counts. */
export const LicenseSeatsRowSchema = Schema.Struct({
  id: NonEmptyStr,
  tier: Schema.String,
  max_seats: D1Number,
  used_seats: D1Number,
});

/** Dashboard team-management license row. */
export const LicenseTeamAuthRowSchema = Schema.Struct({
  id: NonEmptyStr,
  tier: Schema.String,
  status: Schema.String,
  max_seats: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
});

/** License-tier-only lookup. */
export const TierRowSchema = Schema.Struct({ tier: Schema.String });

/** Dashboard team member machine row. */
export const TeamMemberMachineRowSchema = Schema.Struct({
  id: Schema.String,
  machine_id: Schema.String,
  hostname: NullableString,
  os: NullableString,
  arch: NullableString,
  omg_version: NullableString,
  user_name: OptNullStr,
  user_email: OptNullStr,
  is_active: Schema.Number,
  first_seen_at: Schema.String,
  last_seen_at: Schema.String,
});

/** Per-machine usage rolled up for team members. */
export const MemberUsageRowSchema = Schema.Struct({
  machine_id: Schema.String,
  total_commands: D1Number,
  total_packages: D1Number,
  total_time_saved_ms: D1Number,
  last_active: OptNullStr,
});

/** License-wide usage SUM for the team dashboard. */
export const TeamUsageTotalsRowSchema = Schema.Struct({
  total_commands: D1Number,
  total_packages: D1Number,
  total_time_saved_ms: D1Number,
});

/**
 * Whether a license tier may access team and enterprise controls.
 *
 * @param tier - Decoded license tier.
 * @returns True for team and enterprise.
 */
export function isTeamOrEnterpriseTier(tier: string): boolean {
  return tier === 'team' || tier === 'enterprise';
}

/** Admin flag selected from customers.admin. */
export const AdminFlagRowSchema = Schema.Struct({ admin: Schema.Number });

/** Admin user-detail customer row. */
export const AdminCustomerDetailRowSchema = Schema.Struct({
  id: NonEmptyStr,
  email: Schema.String,
  company: OptNullStr,
  tier: OptNullStr,
  admin: Schema.optional(Schema.Number),
  stripe_customer_id: OptNullStr,
  telemetry_opt_out: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  created_at: OptNullStr,
  updated_at: OptNullStr,
});

/** Admin user-detail license row. */
export const AdminLicenseDetailRowSchema = Schema.Struct({
  id: NonEmptyStr,
  customer_id: NonEmptyStr,
  license_key: Schema.String,
  tier: Schema.String,
  status: Schema.String,
  max_seats: OptNullNum,
  max_machines: OptNullNum,
  expires_at: OptNullStr,
  created_at: OptNullStr,
});

/** Admin CRM user-list row from the engagement CTE. */
export const AdminUsersListRowSchema = Schema.Struct({
  id: NonEmptyStr,
  email: Schema.String,
  company: OptNullStr,
  created_at: OptNullStr,
  tier: OptNullStr,
  license_status: OptNullStr,
  machine_count: D1Number,
  total_commands: D1Number,
  last_active_date: OptNullStr,
  active_days_30d: D1Number,
  cmds_3d: D1Number,
  cmds_prev_7d: D1Number,
  velocity: D1Number,
  engagement_score: D1Number,
  lifecycle_stage: OptNullStr,
});

/** Admin users CSV export row. */
export const AdminUsersExportRowSchema = Schema.Struct({
  id: NonEmptyStr,
  email: OptNullStr,
  company: OptNullStr,
  created_at: OptNullStr,
  tier: OptNullStr,
  status: OptNullStr,
  active_machines: D1Number,
  total_commands: D1Number,
});

/** Admin audit-log JSON list row. */
export const AdminAuditLogRowSchema = Schema.Struct({
  id: Schema.String,
  customer_id: OptNullStr,
  user_email: OptNullStr,
  action: Schema.String,
  ip_address: OptNullStr,
  metadata: OptNullStr,
  created_at: Schema.String,
});

/** Admin user-detail machine row. */
export const AdminMachineRowSchema = Schema.Struct({
  id: Schema.String,
  license_id: Schema.String,
  machine_id: Schema.String,
  hostname: OptNullStr,
  os: OptNullStr,
  arch: OptNullStr,
  omg_version: OptNullStr,
  user_name: OptNullStr,
  user_email: OptNullStr,
  is_active: Schema.optional(Schema.Number),
  first_seen_at: OptNullStr,
  last_seen_at: OptNullStr,
});

/** Admin user-detail usage_daily row. */
export const AdminUsageDailyRowSchema = Schema.Struct({
  date: Schema.String,
  license_id: OptNullStr,
  commands_run: D1Number,
  packages_installed: D1Number,
  packages_searched: D1Number,
  runtimes_switched: D1Number,
  sbom_generated: D1Number,
  vulnerabilities_found: D1Number,
  time_saved_ms: D1Number,
});

/** Admin activity audit_log row. */
export const AdminActivityRowSchema = Schema.Struct({
  id: Schema.String,
  customer_id: OptNullStr,
  action: Schema.String,
  resource_type: OptNullStr,
  resource_id: OptNullStr,
  ip_address: OptNullStr,
  created_at: Schema.String,
});

/** Admin CRM note row. */
export const AdminNoteRowSchema = Schema.Struct({
  id: Schema.String,
  customer_id: Schema.String,
  author_id: OptNullStr,
  note_type: OptNullStr,
  content: Schema.String,
  is_pinned: D1Number,
  created_at: Schema.String,
  updated_at: OptNullStr,
  author_email: OptNullStr,
});

/** Admin tag catalog row with assignment counts. */
export const AdminTagCatalogRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: OptNullStr,
  description: OptNullStr,
  created_by: OptNullStr,
  created_at: OptNullStr,
  usage_count: D1Number,
});

/** Tag assigned to a customer. */
export const AdminCustomerTagRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: OptNullStr,
  description: OptNullStr,
  created_by: OptNullStr,
  created_at: OptNullStr,
});

/** 7-day growth counts. */
export const GrowthRowSchema = Schema.Struct({
  new_users_7d: D1Number,
  new_paid_7d: D1Number,
});

/** Hours-saved aggregate. */
export const HoursSavedRowSchema = Schema.Struct({ total_hours: D1Number });

/** Install-to-power-user funnel. */
export const FunnelRowSchema = Schema.Struct({
  installs: D1Number,
  activated: D1Number,
  power_users: D1Number,
});

/** Churn-risk COUNT. */
export const AtRiskRowSchema = Schema.Struct({ at_risk_users: D1Number });

/** Retention rate percent. */
export const RateRowSchema = Schema.Struct({ rate: D1Number });

/** Performance latency aggregates. */
export const PerformanceStatsRowSchema = Schema.Struct({
  avg_ms: D1Number,
  min_ms: D1Number,
  max_ms: D1Number,
  count: D1Number,
});

/** Session telemetry aggregates. */
export const SessionStatsRowSchema = Schema.Struct({
  total_sessions: D1Number,
  sessions_started: D1Number,
  heartbeats_sent: D1Number,
  avg_duration_seconds: D1Number,
  max_duration_seconds: D1Number,
});

/** Lifecycle-stage funnel counts. */
export const JourneyRowSchema = Schema.Struct({
  installed: D1Number,
  activated: D1Number,
  first_command: D1Number,
  exploring: D1Number,
  engaged: D1Number,
  power_user: D1Number,
});

/** 30-day feature adoption SUMs/COUNTs. */
export const FeatureAdoptionRowSchema = Schema.Struct({
  total_installs: D1Number,
  total_searches: D1Number,
  total_runtime_switches: D1Number,
  install_adopters: D1Number,
  search_adopters: D1Number,
  runtime_adopters: D1Number,
  total_active_users: D1Number,
});

/** Time-to-first-command averages. */
export const TimeToValueRowSchema = Schema.Struct({
  avg_days_to_activation: D1Number,
  pct_activated_week1: D1Number,
});

/** Persisted customer health score row. */
export const CustomerHealthRowSchema = Schema.Struct({
  customer_id: Schema.String,
  overall_score: D1Number,
  engagement_score: D1Number,
  activation_score: D1Number,
  growth_score: D1Number,
  risk_score: D1Number,
  lifecycle_stage: Schema.String,
  updated_at: OptNullStr,
});

/** Privacy export customer profile. */
export const PrivacyProfileRowSchema = Schema.Struct({
  id: NonEmptyStr,
  email: OptNullStr,
  company: OptNullStr,
  tier: OptNullStr,
  stripe_customer_id: OptNullStr,
  created_at: OptNullStr,
});

/** Stripe webhook customer lookup. */
export const BillingCustomerRowSchema = Schema.Struct({
  id: NonEmptyStr,
  email: OptNullStr,
  stripe_customer_id: OptNullStr,
});
export type BillingCustomerRow = Schema.Schema.Type<typeof BillingCustomerRowSchema>;

/** Admin-insights platform totals. */
export const InsightsStatsRowSchema = Schema.Struct({
  users: D1Number,
  cmds: D1Number,
  time_ms: D1Number,
  top_error: OptNullStr,
  version_drift_count: D1Number,
});

/**
 * Decode stored firehose properties JSON.
 *
 * Missing or empty values become `{}`. Corrupt JSON fails.
 *
 * @param value - Persisted JSON text.
 * @returns A primitive record, or `ExtraRowParseError`.
 */
export function decodeStoredProperties(
  value: string | null | undefined
): Effect.Effect<Readonly<Record<string, string | number | boolean | null>>, ExtraRowParseError> {
  if (value === null || value === undefined || value.length === 0) {
    return Effect.succeed({});
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause: unknown) {
    return Effect.fail(new ExtraRowParseError('Stored properties are not valid JSON', cause));
  }
  return Schema.decodeUnknown(JsonObject)(parsed).pipe(
    Effect.mapError(
      (cause: unknown): ExtraRowParseError =>
        new ExtraRowParseError('Stored properties JSON has an invalid shape', cause)
    )
  );
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
  value: Schema.Schema.Encoded<Schema.Schema.Any>
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
  value: Schema.Schema.Encoded<Schema.Schema.Any>
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
 * Decode a single optional D1 `.first()` row.
 *
 * Missing rows (`null` / `undefined`) become `undefined`. Malformed rows fail.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The `.first()` result.
 * @returns The typed row, `undefined` when missing, or `ExtraRowParseError`.
 */
export function decodeOptionalExtraRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<Schema.Schema.Type<S> | undefined, ExtraRowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed(undefined);
  }
  return decodeExtraRow(schema, reason, value);
}

/** Outcome of reading an optional D1 `.first()` row. */
export type OptionalExtraRow<A> =
  | { readonly _tag: 'present'; readonly value: A }
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'invalid' };

/**
 * Read an optional D1 `.first()` row without treating malformed data as missing.
 *
 * @param schema - Row schema.
 * @param reason - Parse error reason.
 * @param value - The `.first()` result.
 * @returns Present, missing, or invalid.
 */
export async function readOptionalExtraRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Promise<OptionalExtraRow<Schema.Schema.Type<S>>> {
  const exit = await Effect.runPromiseExit(decodeOptionalExtraRow(schema, reason, value));
  if (Exit.isFailure(exit)) {
    return { _tag: 'invalid' };
  }
  if (exit.value === undefined) {
    return { _tag: 'missing' };
  }
  return { _tag: 'present', value: exit.value };
}

/**
 * The row value when present, otherwise undefined.
 *
 * @param row - Optional-row outcome.
 * @returns The typed row, or undefined.
 */
export function optionalRowValue<A>(row: OptionalExtraRow<A>): A | undefined {
  return row._tag === 'present' ? row.value : undefined;
}

/**
 * Whether an optional-row outcome is a malformed persisted row.
 *
 * @param row - Optional-row outcome.
 * @returns True when the row existed but could not be parsed.
 */
export function isInvalidExtraRow(
  row: OptionalExtraRow<unknown>
): row is { readonly _tag: 'invalid' } {
  return row._tag === 'invalid';
}

/**
 * Whether a customers.admin flag row authorizes admin APIs.
 *
 * Missing or unreadable rows deny admin. Only `admin === 1` grants it.
 *
 * @param row - The `.first()` result from `SELECT admin`.
 * @returns True only when admin is exactly 1.
 */
export async function customerIsAdmin(
  row: Schema.Schema.Encoded<Schema.Schema.Any>
): Promise<boolean> {
  const decoded = await readOptionalExtraRow(
    AdminFlagRowSchema,
    'Admin flag row has an invalid shape',
    row
  );
  return decoded._tag === 'present' && decoded.value.admin === 1;
}
