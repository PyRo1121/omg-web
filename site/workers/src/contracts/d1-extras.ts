// Boundary parser internals decode remaining D1 rows and provider JSON.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-unknown-returns -- Safe JSON/D1 boundary parsing requires these operations.

import { Effect, Exit } from 'effect';
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

/** Privacy export machine_usage row. Nulls are preserved. */
export const PrivacyMachineRowSchema = Schema.Struct({
  machine_id: Schema.String,
  hostname: Schema.optional(NullableString),
  os: Schema.optional(NullableString),
  arch: Schema.optional(NullableString),
  omg_version: Schema.optional(NullableString),
  activated_at: Schema.optional(NullableString),
  last_seen_at: Schema.optional(NullableString),
});
export type PrivacyMachineRow = Schema.Schema.Type<typeof PrivacyMachineRowSchema>;

/** Privacy export command_event row. Nulls are preserved. */
export const PrivacyCommandRowSchema = Schema.Struct({
  command: Schema.String,
  subcommand: Schema.optional(NullableString),
  packages: Schema.optional(NullableString),
  duration_ms: Schema.optional(NullableNumber),
  success: Schema.optional(NullableNumber),
  timestamp: Schema.String,
});
export type PrivacyCommandRow = Schema.Schema.Type<typeof PrivacyCommandRowSchema>;

/** Privacy export session row. Nulls are preserved. */
export const PrivacySessionRowSchema = Schema.Struct({
  session_id: Schema.String,
  event_type: Schema.String,
  start_time: Schema.optional(NullableString),
  end_time: Schema.optional(NullableString),
  commands_run: Schema.optional(NullableNumber),
  duration_secs: Schema.optional(NullableNumber),
  timestamp: Schema.String,
});
export type PrivacySessionRow = Schema.Schema.Type<typeof PrivacySessionRowSchema>;

/** Privacy export performance aggregate. */
export const PrivacyPerformanceRowSchema = Schema.Struct({
  metric_type: Schema.String,
  avg_duration_ms: Schema.optional(NullableNumber),
  sample_count: D1Number,
});
export type PrivacyPerformanceRow = Schema.Schema.Type<typeof PrivacyPerformanceRowSchema>;

/** Privacy export feature_usage aggregate. */
export const PrivacyFeatureRowSchema = Schema.Struct({
  feature: Schema.String,
  enabled: Schema.Number,
  usage_count: D1Number,
  last_used: Schema.optional(NullableString),
});
export type PrivacyFeatureRow = Schema.Schema.Type<typeof PrivacyFeatureRowSchema>;

/** usage_daily chart row for the dashboard team view. */
export const UsageDailyRowSchema = Schema.Struct({
  date: Schema.String,
  commands_run: D1Number,
  time_saved_ms: D1Number,
});
export type UsageDailyRow = Schema.Schema.Type<typeof UsageDailyRowSchema>;

/** Dashboard audit log list row. */
export const DashboardAuditLogRowSchema = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  resource_type: Schema.optional(NullableString),
  resource_id: Schema.optional(NullableString),
  ip_address: Schema.optional(NullableString),
  created_at: Schema.String,
});
export type DashboardAuditLogRow = Schema.Schema.Type<typeof DashboardAuditLogRowSchema>;

/** Team-controls policy row. */
export const PolicyRowSchema = Schema.Struct({
  id: Schema.String,
  scope: Schema.String,
  rule: Schema.String,
  value: Schema.String,
  enforced: Schema.Number,
  created_at: Schema.String,
});
export type PolicyRow = Schema.Schema.Type<typeof PolicyRowSchema>;

/** Team-controls member machine rollup. */
export const TeamControlMemberRowSchema = Schema.Struct({
  machine_id: Schema.String,
  hostname: Schema.optional(NullableString),
  os: Schema.optional(NullableString),
  arch: Schema.optional(NullableString),
  omg_version: Schema.optional(NullableString),
  last_seen_at: Schema.optional(NullableString),
  first_seen_at: Schema.optional(NullableString),
  is_active: Schema.optional(Schema.Number),
  total_commands: D1Number,
  total_time_saved_ms: D1Number,
  commands_last_7d: D1Number,
});
export type TeamControlMemberRow = Schema.Schema.Type<typeof TeamControlMemberRowSchema>;

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

/** Site analytics geo rollup. */
export const SiteGeoRowSchema = Schema.Struct({
  country_code: Schema.String,
  visitors: D1Number,
  sessions: D1Number,
  pageviews: D1Number,
});
export type SiteGeoRow = Schema.Schema.Type<typeof SiteGeoRowSchema>;

/** Docs analytics geo rollup. */
export const DocsGeoRowSchema = Schema.Struct({
  country_code: Schema.String,
  sessions: D1Number,
  pageviews: D1Number,
});
export type DocsGeoRow = Schema.Schema.Type<typeof DocsGeoRowSchema>;

/** CLI install geo count from audit metadata. */
export const CliGeoRowSchema = Schema.Struct({
  country_code: Schema.String,
  count: D1Number,
});
export type CliGeoRow = Schema.Schema.Type<typeof CliGeoRowSchema>;

/** Realtime visitors by country. */
export const SiteRealtimeCountryRowSchema = Schema.Struct({
  country_code: Schema.optional(NullableString),
  count: D1Number,
});
export type SiteRealtimeCountryRow = Schema.Schema.Type<typeof SiteRealtimeCountryRowSchema>;

/** Realtime visitors by page. */
export const SiteRealtimePageRowSchema = Schema.Struct({
  page_path: Schema.optional(NullableString),
  count: D1Number,
});
export type SiteRealtimePageRow = Schema.Schema.Type<typeof SiteRealtimePageRowSchema>;

/** Site analytics daily trend. */
export const SiteDailyTrendRowSchema = Schema.Struct({
  date: Schema.optional(NullableString),
  pageviews: D1Number,
  visitors: D1Number,
});
export type SiteDailyTrendRow = Schema.Schema.Type<typeof SiteDailyTrendRowSchema>;

/** Site analytics top page. */
export const SiteTopPageRowSchema = Schema.Struct({
  path: Schema.optional(NullableString),
  views: D1Number,
  visitors: D1Number,
});
export type SiteTopPageRow = Schema.Schema.Type<typeof SiteTopPageRowSchema>;

/** Site analytics referrer rollup. */
export const SiteReferrerRowSchema = Schema.Struct({
  referrer_domain: Schema.optional(NullableString),
  visitors: D1Number,
  pageviews: D1Number,
});
export type SiteReferrerRow = Schema.Schema.Type<typeof SiteReferrerRowSchema>;

/** Site analytics device rollup. */
export const SiteDeviceRowSchema = Schema.Struct({
  device_type: Schema.optional(NullableString),
  visitors: D1Number,
});
export type SiteDeviceRow = Schema.Schema.Type<typeof SiteDeviceRowSchema>;

/** Docs analytics top page. */
export const DocsTopPageRowSchema = Schema.Struct({
  path: Schema.optional(NullableString),
  views: D1Number,
  sessions: D1Number,
  avg_time: D1Number,
});
export type DocsTopPageRow = Schema.Schema.Type<typeof DocsTopPageRowSchema>;

/** Docs analytics referrer rollup. */
export const DocsReferrerRowSchema = Schema.Struct({
  referrer: Schema.optional(NullableString),
  sessions: D1Number,
  pageviews: D1Number,
});
export type DocsReferrerRow = Schema.Schema.Type<typeof DocsReferrerRowSchema>;

/** Docs analytics UTM campaign rollup. */
export const DocsUtmRowSchema = Schema.Struct({
  utm_source: Schema.optional(NullableString),
  utm_medium: Schema.optional(NullableString),
  utm_campaign: Schema.optional(NullableString),
  sessions: D1Number,
  pageviews: D1Number,
});
export type DocsUtmRow = Schema.Schema.Type<typeof DocsUtmRowSchema>;

/** Docs analytics interaction rollup. */
export const DocsInteractionRowSchema = Schema.Struct({
  interaction_type: Schema.optional(NullableString),
  target: Schema.optional(NullableString),
  count: D1Number,
});
export type DocsInteractionRow = Schema.Schema.Type<typeof DocsInteractionRowSchema>;

/** Docs analytics performance rollup. */
export const DocsPerformanceRowSchema = Schema.Struct({
  path: Schema.optional(NullableString),
  avg_load: D1Number,
  p95_load: D1Number,
  samples: D1Number,
});
export type DocsPerformanceRow = Schema.Schema.Type<typeof DocsPerformanceRowSchema>;

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

/** Admin dashboard DAU-by-date row. */
export const AdminDailyActiveRowSchema = Schema.Struct({
  date: Schema.String,
  active_users: D1Number,
  commands: D1Number,
});
export type AdminDailyActiveRow = Schema.Schema.Type<typeof AdminDailyActiveRowSchema>;

/** Admin dashboard signups-by-date row. */
export const AdminDateCountRowSchema = Schema.Struct({
  date: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminDateCountRow = Schema.Schema.Type<typeof AdminDateCountRowSchema>;

/** Admin install counts by platform. */
export const AdminPlatformCountRowSchema = Schema.Struct({
  platform: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminPlatformCountRow = Schema.Schema.Type<typeof AdminPlatformCountRowSchema>;

/** Admin install counts by version. */
export const AdminVersionCountRowSchema = Schema.Struct({
  version: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminVersionCountRow = Schema.Schema.Type<typeof AdminVersionCountRowSchema>;

/** Admin subscription counts by status. */
export const AdminStatusCountRowSchema = Schema.Struct({
  status: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminStatusCountRow = Schema.Schema.Type<typeof AdminStatusCountRowSchema>;

/** Admin fleet counts by CLI version. */
export const AdminFleetVersionRowSchema = Schema.Struct({
  omg_version: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminFleetVersionRow = Schema.Schema.Type<typeof AdminFleetVersionRowSchema>;

/** Admin geo dimension count. */
export const AdminGeoDimensionRowSchema = Schema.Struct({
  dimension: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminGeoDimensionRow = Schema.Schema.Type<typeof AdminGeoDimensionRowSchema>;

/** Admin analytics command aggregate. */
export const AdminCommandCountRowSchema = Schema.Struct({
  command: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminCommandCountRow = Schema.Schema.Type<typeof AdminCommandCountRowSchema>;

/** Admin analytics error aggregate. */
export const AdminErrorTypeCountRowSchema = Schema.Struct({
  error_type: Schema.optional(NullableString),
  count: D1Number,
});
export type AdminErrorTypeCountRow = Schema.Schema.Type<typeof AdminErrorTypeCountRowSchema>;

/** Admin analytics runtime usage aggregate. */
export const AdminRuntimeUsageRowSchema = Schema.Struct({
  runtime: Schema.optional(NullableString),
  count: D1Number,
  machines: D1Number,
});
export type AdminRuntimeUsageRow = Schema.Schema.Type<typeof AdminRuntimeUsageRowSchema>;

/** Admin cohort retention cell. */
export const AdminCohortRowSchema = Schema.Struct({
  cohort_month: Schema.optional(NullableString),
  month_index: D1Number,
  active_users: D1Number,
});
export type AdminCohortRow = Schema.Schema.Type<typeof AdminCohortRowSchema>;

/** Admin paid-invoice monthly rollup. */
export const AdminMonthlyRevenueRowSchema = Schema.Struct({
  month: Schema.optional(NullableString),
  revenue: D1Number,
  transactions: D1Number,
});
export type AdminMonthlyRevenueRow = Schema.Schema.Type<typeof AdminMonthlyRevenueRowSchema>;

/** Admin paid-invoice rollup by license tier. */
export const AdminRevenueByTierRowSchema = Schema.Struct({
  tier: Schema.optional(NullableString),
  total_revenue: D1Number,
  customers: D1Number,
});
export type AdminRevenueByTierRow = Schema.Schema.Type<typeof AdminRevenueByTierRowSchema>;

/** Admin weekly retention cell. */
export const AdminRetentionCohortRowSchema = Schema.Struct({
  cohort_date: Schema.optional(NullableString),
  week_number: D1Number,
  retained_users: D1Number,
});
export type AdminRetentionCohortRow = Schema.Schema.Type<typeof AdminRetentionCohortRowSchema>;

/** Admin average LTV by license tier. */
export const AdminLtvByTierRowSchema = Schema.Struct({
  tier: Schema.optional(NullableString),
  customer_count: D1Number,
  avg_ltv: D1Number,
});
export type AdminLtvByTierRow = Schema.Schema.Type<typeof AdminLtvByTierRowSchema>;

/** Admin command events by hour and weekday. */
export const AdminCommandHeatmapRowSchema = Schema.Struct({
  hour: Schema.optional(NullableString),
  day_of_week: Schema.optional(NullableString),
  event_count: D1Number,
});
export type AdminCommandHeatmapRow = Schema.Schema.Type<typeof AdminCommandHeatmapRowSchema>;

/** Admin runtime adoption aggregate. */
export const AdminRuntimeAdoptionRowSchema = Schema.Struct({
  runtime: Schema.optional(NullableString),
  unique_users: D1Number,
  total_uses: D1Number,
});
export type AdminRuntimeAdoptionRow = Schema.Schema.Type<typeof AdminRuntimeAdoptionRowSchema>;

/** Admin per-license churn-risk classification. */
export const AdminChurnRiskSegmentRowSchema = Schema.Struct({
  tier: Schema.optional(NullableString),
  user_count: D1Number,
  risk_segment: Schema.String,
});
export type AdminChurnRiskSegmentRow = Schema.Schema.Type<typeof AdminChurnRiskSegmentRowSchema>;

/** Admin expansion/upsell candidate. */
export const AdminExpansionOpportunityRowSchema = Schema.Struct({
  email: Schema.optional(NullableString),
  tier: Schema.optional(NullableString),
  active_machines: D1Number,
  total_commands_30d: D1Number,
  opportunity_type: Schema.optional(NullableString),
  priority: Schema.String,
});
export type AdminExpansionOpportunityRow = Schema.Schema.Type<
  typeof AdminExpansionOpportunityRowSchema
>;

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

/** Active license id and tier used for team-controls authorization. */
export const LicenseIdTierRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
});
export type LicenseIdTierRow = Schema.Schema.Type<typeof LicenseIdTierRowSchema>;

/** Active license row that also carries seat counts. */
export const LicenseSeatsRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
  max_seats: D1Number,
  used_seats: D1Number,
});
export type LicenseSeatsRow = Schema.Schema.Type<typeof LicenseSeatsRowSchema>;

/** Dashboard team-management license row. */
export const LicenseTeamAuthRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
  status: Schema.String,
  max_seats: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
});
export type LicenseTeamAuthRow = Schema.Schema.Type<typeof LicenseTeamAuthRowSchema>;

/** License-tier-only lookup. */
export const TierRowSchema = Schema.Struct({
  tier: Schema.String,
});
export type TierRow = Schema.Schema.Type<typeof TierRowSchema>;

/** COUNT(*) AS total aggregate. */
export const TotalRowSchema = Schema.Struct({
  total: D1Number,
});
export type TotalRow = Schema.Schema.Type<typeof TotalRowSchema>;

/** Machine hostname selected for audit metadata. */
export const HostnameRowSchema = Schema.Struct({
  hostname: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
});
export type HostnameRow = Schema.Schema.Type<typeof HostnameRowSchema>;

/** Dashboard team member machine row. */
export const TeamMemberMachineRowSchema = Schema.Struct({
  id: Schema.String,
  machine_id: Schema.String,
  hostname: Schema.Union(Schema.Null, Schema.String),
  os: Schema.Union(Schema.Null, Schema.String),
  arch: Schema.Union(Schema.Null, Schema.String),
  omg_version: Schema.Union(Schema.Null, Schema.String),
  user_name: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  user_email: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  is_active: Schema.Number,
  first_seen_at: Schema.String,
  last_seen_at: Schema.String,
});
export type TeamMemberMachineRow = Schema.Schema.Type<typeof TeamMemberMachineRowSchema>;

/** Per-machine usage rolled up for team members. */
export const MemberUsageRowSchema = Schema.Struct({
  machine_id: Schema.String,
  total_commands: D1Number,
  total_packages: D1Number,
  total_time_saved_ms: D1Number,
  last_active: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
});
export type MemberUsageRow = Schema.Schema.Type<typeof MemberUsageRowSchema>;

/** Last-7-day command totals keyed by machine. */
export const MemberRecentUsageRowSchema = Schema.Struct({
  machine_id: Schema.String,
  commands_last_7d: D1Number,
});
export type MemberRecentUsageRow = Schema.Schema.Type<typeof MemberRecentUsageRowSchema>;

/** License-wide usage SUM for the team dashboard. */
export const TeamUsageTotalsRowSchema = Schema.Struct({
  total_commands: D1Number,
  total_packages: D1Number,
  total_time_saved_ms: D1Number,
});
export type TeamUsageTotalsRow = Schema.Schema.Type<typeof TeamUsageTotalsRowSchema>;

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
export const AdminFlagRowSchema = Schema.Struct({
  admin: Schema.Number,
});
export type AdminFlagRow = Schema.Schema.Type<typeof AdminFlagRowSchema>;

/** Admin user-detail customer row. */
export const AdminCustomerDetailRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String,
  company: Schema.optional(NullableString),
  tier: Schema.optional(NullableString),
  admin: Schema.optional(Schema.Number),
  stripe_customer_id: Schema.optional(NullableString),
  telemetry_opt_out: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  created_at: Schema.optional(NullableString),
  updated_at: Schema.optional(NullableString),
});
export type AdminCustomerDetailRow = Schema.Schema.Type<typeof AdminCustomerDetailRowSchema>;

/** Admin user-detail license row. */
export const AdminLicenseDetailRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  customer_id: Schema.String.pipe(Schema.minLength(1)),
  license_key: Schema.String,
  tier: Schema.String,
  status: Schema.String,
  max_seats: Schema.optional(NullableNumber),
  max_machines: Schema.optional(NullableNumber),
  expires_at: Schema.optional(NullableString),
  created_at: Schema.optional(NullableString),
});
export type AdminLicenseDetailRow = Schema.Schema.Type<typeof AdminLicenseDetailRowSchema>;

/** Admin CRM user-list row from the engagement CTE. */
export const AdminUsersListRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.String,
  company: Schema.optional(NullableString),
  created_at: Schema.optional(NullableString),
  tier: Schema.optional(NullableString),
  license_status: Schema.optional(NullableString),
  machine_count: D1Number,
  total_commands: D1Number,
  last_active_date: Schema.optional(NullableString),
  active_days_30d: D1Number,
  cmds_3d: D1Number,
  cmds_prev_7d: D1Number,
  velocity: D1Number,
  engagement_score: D1Number,
  lifecycle_stage: Schema.optional(NullableString),
});
export type AdminUsersListRow = Schema.Schema.Type<typeof AdminUsersListRowSchema>;

/** Admin users CSV export row. */
export const AdminUsersExportRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.optional(NullableString),
  company: Schema.optional(NullableString),
  created_at: Schema.optional(NullableString),
  tier: Schema.optional(NullableString),
  status: Schema.optional(NullableString),
  active_machines: D1Number,
  total_commands: D1Number,
});
export type AdminUsersExportRow = Schema.Schema.Type<typeof AdminUsersExportRowSchema>;

/** Admin audit-log JSON list row. */
export const AdminAuditLogRowSchema = Schema.Struct({
  id: Schema.String,
  customer_id: Schema.optional(NullableString),
  user_email: Schema.optional(NullableString),
  action: Schema.String,
  ip_address: Schema.optional(NullableString),
  metadata: Schema.optional(NullableString),
  created_at: Schema.String,
});
export type AdminAuditLogRow = Schema.Schema.Type<typeof AdminAuditLogRowSchema>;

/** Admin user-detail machine row. */
export const AdminMachineRowSchema = Schema.Struct({
  id: Schema.String,
  license_id: Schema.String,
  machine_id: Schema.String,
  hostname: Schema.optional(NullableString),
  os: Schema.optional(NullableString),
  arch: Schema.optional(NullableString),
  omg_version: Schema.optional(NullableString),
  user_name: Schema.optional(NullableString),
  user_email: Schema.optional(NullableString),
  is_active: Schema.optional(Schema.Number),
  first_seen_at: Schema.optional(NullableString),
  last_seen_at: Schema.optional(NullableString),
});
export type AdminMachineRow = Schema.Schema.Type<typeof AdminMachineRowSchema>;

/** Admin user-detail usage_daily row. */
export const AdminUsageDailyRowSchema = Schema.Struct({
  date: Schema.String,
  license_id: Schema.optional(NullableString),
  commands_run: D1Number,
  packages_installed: D1Number,
  packages_searched: D1Number,
  runtimes_switched: D1Number,
  sbom_generated: D1Number,
  vulnerabilities_found: D1Number,
  time_saved_ms: D1Number,
});
export type AdminUsageDailyRow = Schema.Schema.Type<typeof AdminUsageDailyRowSchema>;

/** Admin activity audit_log row. */
export const AdminActivityRowSchema = Schema.Struct({
  id: Schema.String,
  customer_id: Schema.optional(NullableString),
  action: Schema.String,
  resource_type: Schema.optional(NullableString),
  resource_id: Schema.optional(NullableString),
  ip_address: Schema.optional(NullableString),
  created_at: Schema.String,
});
export type AdminActivityRow = Schema.Schema.Type<typeof AdminActivityRowSchema>;

/** Admin CRM note row. */
export const AdminNoteRowSchema = Schema.Struct({
  id: Schema.String,
  customer_id: Schema.String,
  author_id: Schema.optional(NullableString),
  note_type: Schema.optional(NullableString),
  content: Schema.String,
  is_pinned: D1Number,
  created_at: Schema.String,
  updated_at: Schema.optional(NullableString),
  author_email: Schema.optional(NullableString),
});
export type AdminNoteRow = Schema.Schema.Type<typeof AdminNoteRowSchema>;

/** Admin tag catalog row with assignment counts. */
export const AdminTagCatalogRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.optional(NullableString),
  description: Schema.optional(NullableString),
  created_by: Schema.optional(NullableString),
  created_at: Schema.optional(NullableString),
  usage_count: D1Number,
});
export type AdminTagCatalogRow = Schema.Schema.Type<typeof AdminTagCatalogRowSchema>;

/** Tag assigned to a customer. */
export const AdminCustomerTagRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.optional(NullableString),
  description: Schema.optional(NullableString),
  created_by: Schema.optional(NullableString),
  created_at: Schema.optional(NullableString),
});
export type AdminCustomerTagRow = Schema.Schema.Type<typeof AdminCustomerTagRowSchema>;

/** 7-day growth counts. */
export const GrowthRowSchema = Schema.Struct({
  new_users_7d: D1Number,
  new_paid_7d: D1Number,
});
export type GrowthRow = Schema.Schema.Type<typeof GrowthRowSchema>;

/** Hours-saved aggregate. */
export const HoursSavedRowSchema = Schema.Struct({
  total_hours: D1Number,
});
export type HoursSavedRow = Schema.Schema.Type<typeof HoursSavedRowSchema>;

/** Install-to-power-user funnel. */
export const FunnelRowSchema = Schema.Struct({
  installs: D1Number,
  activated: D1Number,
  power_users: D1Number,
});
export type FunnelRow = Schema.Schema.Type<typeof FunnelRowSchema>;

/** Churn-risk COUNT. */
export const AtRiskRowSchema = Schema.Struct({
  at_risk_users: D1Number,
});
export type AtRiskRow = Schema.Schema.Type<typeof AtRiskRowSchema>;

/** Retention rate percent. */
export const RateRowSchema = Schema.Struct({
  rate: D1Number,
});
export type RateRow = Schema.Schema.Type<typeof RateRowSchema>;

/** Performance latency aggregates. */
export const PerformanceStatsRowSchema = Schema.Struct({
  avg_ms: D1Number,
  min_ms: D1Number,
  max_ms: D1Number,
  count: D1Number,
});
export type PerformanceStatsRow = Schema.Schema.Type<typeof PerformanceStatsRowSchema>;

/** Session telemetry aggregates. */
export const SessionStatsRowSchema = Schema.Struct({
  total_sessions: D1Number,
  sessions_started: D1Number,
  heartbeats_sent: D1Number,
  avg_duration_seconds: D1Number,
  max_duration_seconds: D1Number,
});
export type SessionStatsRow = Schema.Schema.Type<typeof SessionStatsRowSchema>;

/** Lifecycle-stage funnel counts. */
export const JourneyRowSchema = Schema.Struct({
  installed: D1Number,
  activated: D1Number,
  first_command: D1Number,
  exploring: D1Number,
  engaged: D1Number,
  power_user: D1Number,
});
export type JourneyRow = Schema.Schema.Type<typeof JourneyRowSchema>;

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
export type FeatureAdoptionRow = Schema.Schema.Type<typeof FeatureAdoptionRowSchema>;

/** Time-to-first-command averages. */
export const TimeToValueRowSchema = Schema.Struct({
  avg_days_to_activation: D1Number,
  pct_activated_week1: D1Number,
});
export type TimeToValueRow = Schema.Schema.Type<typeof TimeToValueRowSchema>;

/** Persisted customer health score row. */
export const CustomerHealthRowSchema = Schema.Struct({
  customer_id: Schema.String,
  overall_score: D1Number,
  engagement_score: D1Number,
  activation_score: D1Number,
  growth_score: D1Number,
  risk_score: D1Number,
  lifecycle_stage: Schema.String,
  updated_at: Schema.optional(NullableString),
});
export type CustomerHealthRow = Schema.Schema.Type<typeof CustomerHealthRowSchema>;

/** Privacy export customer profile. */
export const PrivacyProfileRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.optional(NullableString),
  company: Schema.optional(NullableString),
  tier: Schema.optional(NullableString),
  stripe_customer_id: Schema.optional(NullableString),
  created_at: Schema.optional(NullableString),
});
export type PrivacyProfileRow = Schema.Schema.Type<typeof PrivacyProfileRowSchema>;

/** Stripe webhook customer lookup. */
export const BillingCustomerRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.optional(NullableString),
  stripe_customer_id: Schema.optional(NullableString),
});
export type BillingCustomerRow = Schema.Schema.Type<typeof BillingCustomerRowSchema>;

/** Admin-insights platform totals. */
export const InsightsStatsRowSchema = Schema.Struct({
  users: D1Number,
  cmds: D1Number,
  time_ms: D1Number,
  top_error: Schema.optional(NullableString),
  version_drift_count: D1Number,
});
export type InsightsStatsRow = Schema.Schema.Type<typeof InsightsStatsRowSchema>;

/** Team-insights usage SUMs. */
export const InsightsUsageRowSchema = Schema.Struct({
  cmds: D1Number,
  time: D1Number,
});
export type InsightsUsageRow = Schema.Schema.Type<typeof InsightsUsageRowSchema>;

/** Team-insights product SUMs. */
export const InsightsProductRowSchema = Schema.Struct({
  searches: D1Number,
  installs: D1Number,
  runtime_switches: D1Number,
});
export type InsightsProductRow = Schema.Schema.Type<typeof InsightsProductRowSchema>;

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
  value: unknown
): Effect.Effect<Schema.Schema.Type<S> | undefined, ExtraRowParseError> {
  if (value === undefined || value === null) {
    return Effect.succeed(undefined);
  }
  return decodeExtraRow(schema, reason, value);
}

/**
 * Whether a customers.admin flag row authorizes admin APIs.
 *
 * Missing or unreadable rows deny admin. Only `admin === 1` grants it.
 *
 * @param row - The `.first()` result from `SELECT admin`.
 * @returns True only when admin is exactly 1.
 */
export async function customerIsAdmin(row: unknown): Promise<boolean> {
  const decoded = await Effect.runPromiseExit(
    decodeOptionalExtraRow(AdminFlagRowSchema, 'Admin flag row has an invalid shape', row)
  );
  if (Exit.isFailure(decoded) || decoded.value === undefined) {
    return false;
  }
  return decoded.value.admin === 1;
}
