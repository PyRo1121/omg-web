import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  AdminOverviewForbidden,
  loadAdminServiceSession,
  loadPrivateWorkerPayload,
  parseLicensingInput,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';
import { normalizedOptionalText } from './optional-text.server';

const RESPONSE_LIMIT = 512 * 1024;
const Count = Schema.Number.check(Schema.makeFilter(value => Number.isFinite(value) && value >= 0));
const SignedNumber = Schema.Number.check(Schema.makeFilter(Number.isFinite));
const Text = Schema.String.check(Schema.isMaxLength(256));
const NonEmptyText = Text.check(Schema.isMinLength(1));
const OptionalText = Schema.NullOr(Text);
const PercentageText = Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?%$/u));
const DayCountSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 7, maximum: 90 })
);

const ProductAnalyticsSchema = Schema.Struct({
  commands_by_type: Schema.Array(Schema.Struct({ command: OptionalText, count: Count })),
  errors_by_type: Schema.Array(Schema.Struct({ error_type: OptionalText, count: Count })),
  growth: Schema.Struct({ new_users_7d: Count, new_paid_7d: Count, growth_rate: SignedNumber }),
  time_saved: Schema.Struct({ total_hours: Count }),
  funnel: Schema.Struct({ installs: Count, activated: Count, power_users: Count }),
  churn_risk: Schema.Struct({ at_risk_users: Count }),
  retention_rate: SignedNumber,
  performance: Schema.Struct({
    avg_latency_ms: Count,
    min_ms: Count,
    max_ms: Count,
    query_count: Count,
  }),
  sessions: Schema.Struct({
    total_30d: Count,
    sessions_started: Count,
    heartbeats_sent: Count,
    avg_duration_seconds: Count,
    max_duration_seconds: Count,
  }),
  user_journey: Schema.Struct({
    funnel: Schema.Struct({
      installed: Count,
      activated: Count,
      first_command: Count,
      exploring: Count,
      engaged: Count,
      power_user: Count,
    }),
  }),
  runtime_usage: Schema.Array(
    Schema.Struct({ runtime: OptionalText, count: Count, machines: Count })
  ),
});

const CohortsSchema = Schema.Struct({
  cohorts: Schema.Array(
    Schema.Struct({ cohort_month: OptionalText, month_index: Count, active_users: Count })
  ),
});

const SiteAnalyticsSchema = Schema.Struct({
  period_days: Count,
  summary: Schema.Struct({ total_pageviews: Count, total_visitors: Count, total_sessions: Count }),
  daily_trend: Schema.Array(
    Schema.Struct({ date: NonEmptyText, pageviews: Count, visitors: Count })
  ),
  top_pages: Schema.Array(Schema.Struct({ path: NonEmptyText, views: Count, visitors: Count })),
  top_referrers: Schema.Array(
    Schema.Struct({ referrer_domain: OptionalText, visitors: Count, pageviews: Count })
  ),
  device_breakdown: Schema.Array(Schema.Struct({ device_type: OptionalText, visitors: Count })),
});

const GeoSchema = Schema.Struct({
  period_days: Count,
  total_countries: Count,
  total_engagement: Count,
  geo_distribution: Schema.Array(
    Schema.Struct({
      country_code: NonEmptyText,
      user_count: Count,
      percentage: Count,
      breakdown: Schema.Struct({ site_visitors: Count, docs_sessions: Count, cli_installs: Count }),
    })
  ),
  by_source: Schema.Struct({ site: Count, docs: Count, cli: Count }),
});

const DocsAnalyticsSchema = Schema.Struct({
  summary: Schema.Struct({
    total_pageviews: Count,
    total_sessions: Count,
    avg_pages_per_session: Text,
    period_days: Count,
  }),
  pageviews_over_time: Schema.Array(
    Schema.Struct({ date: Schema.optional(NonEmptyText), views: Count, sessions: Count })
  ),
  top_pages: Schema.Array(
    Schema.Struct({ path: OptionalText, views: Count, sessions: Count, avg_time: Count })
  ),
  top_referrers: Schema.Array(
    Schema.Struct({ referrer: OptionalText, sessions: Count, pageviews: Count })
  ),
  utm_campaigns: Schema.Array(
    Schema.Struct({
      utm_source: OptionalText,
      utm_medium: OptionalText,
      utm_campaign: OptionalText,
      sessions: Count,
      pageviews: Count,
    })
  ),
  geographic: Schema.Array(
    Schema.Struct({ country_code: NonEmptyText, sessions: Count, pageviews: Count })
  ),
  top_interactions: Schema.Array(
    Schema.Struct({ interaction_type: OptionalText, target: OptionalText, count: Count })
  ),
  performance: Schema.Array(
    Schema.Struct({ path: OptionalText, avg_load: Count, p95_load: Count, samples: Count })
  ),
});

const InsightsSchema = Schema.Struct({
  engagement: Schema.Struct({
    dau: Count,
    wau: Count,
    mau: Count,
    stickiness: Schema.Struct({
      daily_to_monthly: PercentageText,
      weekly_to_monthly: PercentageText,
    }),
  }),
  retention: Schema.Struct({
    cohorts: Schema.Array(
      Schema.Struct({ cohort_date: OptionalText, week_number: Count, retained_users: Count })
    ),
  }),
  ltv_by_tier: Schema.Array(
    Schema.Struct({ avg_ltv: Count, tier: OptionalText, customer_count: Count })
  ),
  feature_adoption: Schema.Struct({
    total_installs: Count,
    total_searches: Count,
    total_runtime_switches: Count,
    total_sbom: Count,
    total_vulns: Count,
    install_adopters: Count,
    search_adopters: Count,
    runtime_adopters: Count,
    sbom_adopters: Count,
    total_active_users: Count,
  }),
  command_heatmap: Schema.Array(
    Schema.Struct({ hour: OptionalText, day_of_week: OptionalText, event_count: Count })
  ),
  runtime_adoption: Schema.Array(
    Schema.Struct({ runtime: OptionalText, unique_users: Count, total_uses: Count })
  ),
  churn_risk_segments: Schema.Array(
    Schema.Struct({ risk_segment: NonEmptyText, user_count: Count, tier: OptionalText })
  ),
  expansion_opportunities: Schema.Array(
    Schema.Struct({
      email: OptionalText,
      tier: OptionalText,
      active_machines: Count,
      total_commands_30d: Count,
      opportunity_type: OptionalText,
      priority: NonEmptyText,
    })
  ),
  time_to_value: Schema.Struct({
    avg_days_to_activation: Schema.NullOr(Count),
    pct_activated_week1: Schema.NullOr(Count),
  }),
  revenue_metrics: Schema.Struct({
    current_mrr: Count,
    projected_arr: Count,
    expansion_mrr_12m: Count,
  }),
});

const RevenueSchema = Schema.Struct({
  mrr: Count,
  arr: Count,
  monthly_revenue: Schema.Array(
    Schema.Struct({ month: OptionalText, revenue: Count, transactions: Count })
  ),
  revenue_by_tier: Schema.Array(
    Schema.Struct({ tier: OptionalText, total_revenue: Count, customers: Count })
  ),
});

type AdminAnalytics = ReturnType<typeof projectAnalytics>;

export function parseAdminAnalyticsDays(url: URL): 7 | 30 | 90 | null {
  const value = url.searchParams.get('days') ?? '30';
  if (value === '7') return 7;
  if (value === '30') return 30;
  if (value === '90') return 90;
  return null;
}
type AdminInsights = ReturnType<typeof projectInsights>;
type AdminRevenue = ReturnType<typeof projectRevenue>;

function compactLabelRows<T extends object, P>(
  rows: ReadonlyArray<T>,
  labelOf: (row: T) => string | null,
  project: (row: T, label: string) => P
): ReadonlyArray<P> {
  const result: Array<P> = [];
  for (const row of rows) {
    const label = normalizedOptionalText(labelOf(row));
    if (label !== null) result.push(project(row, label));
  }
  return result;
}

function projectAnalytics(
  product: Schema.Schema.Type<typeof ProductAnalyticsSchema>,
  cohorts: Schema.Schema.Type<typeof CohortsSchema>,
  site: Schema.Schema.Type<typeof SiteAnalyticsSchema>,
  geo: Schema.Schema.Type<typeof GeoSchema>,
  docs: Schema.Schema.Type<typeof DocsAnalyticsSchema>
) {
  return {
    product,
    cohorts: compactLabelRows(
      cohorts.cohorts,
      row => row.cohort_month,
      (row, cohortMonth) => ({
        cohortMonth,
        monthIndex: row.month_index,
        activeUsers: row.active_users,
      })
    ),
    site,
    geo,
    docs,
  };
}

function projectInsights(payload: Schema.Schema.Type<typeof InsightsSchema>) {
  return {
    engagement: payload.engagement,
    retention: compactLabelRows(
      payload.retention.cohorts,
      row => row.cohort_date,
      (row, cohortDate) => ({
        cohortDate,
        weekNumber: row.week_number,
        retainedUsers: row.retained_users,
      })
    ),
    ltvByTier: compactLabelRows(
      payload.ltv_by_tier,
      row => row.tier,
      (row, tier) => ({ tier, averageLtv: row.avg_ltv, customerCount: row.customer_count })
    ),
    featureAdoption: payload.feature_adoption,
    commandHeatmap: payload.command_heatmap,
    runtimeAdoption: compactLabelRows(
      payload.runtime_adoption,
      row => row.runtime,
      (row, runtime) => ({ runtime, uniqueUsers: row.unique_users, totalUses: row.total_uses })
    ),
    churnRisk: payload.churn_risk_segments,
    expansionOpportunities: payload.expansion_opportunities.flatMap(opportunity => {
      const email = normalizedOptionalText(opportunity.email);
      if (email === null) return [];
      return [
        {
          email,
          tier: normalizedOptionalText(opportunity.tier) ?? 'unknown',
          activeMachines: opportunity.active_machines,
          commands30d: opportunity.total_commands_30d,
          opportunityType: normalizedOptionalText(opportunity.opportunity_type) ?? 'review',
          priority: opportunity.priority,
        },
      ];
    }),
    timeToValue: payload.time_to_value,
    revenue: payload.revenue_metrics,
  };
}

function projectRevenue(payload: Schema.Schema.Type<typeof RevenueSchema>) {
  return {
    mrr: payload.mrr,
    arr: payload.arr,
    monthly: compactLabelRows(
      payload.monthly_revenue,
      row => row.month,
      (row, month) => ({ month, revenue: row.revenue, transactions: row.transactions })
    ),
    byTier: compactLabelRows(
      payload.revenue_by_tier,
      row => row.tier,
      (row, tier) => ({ tier, totalRevenue: row.total_revenue, customers: row.customers })
    ),
  };
}

type AdminIntelligenceError = LicensingSummaryError | AdminOverviewForbidden;

/** Load product, site, geographic, and cohort analytics only for the selected route. */
export function loadAdminAnalytics(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  days: number
): Effect.Effect<AdminAnalytics, AdminIntelligenceError> {
  return Effect.gen(function* () {
    const safeDays = yield* parseLicensingInput(
      DayCountSchema,
      days,
      'Analytics period is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const [product, cohorts, site, geo, docs] = yield* Effect.all(
      [
        loadPrivateWorkerPayload(
          env,
          session,
          '/api/admin/analytics',
          'admin-analytics',
          RESPONSE_LIMIT,
          ProductAnalyticsSchema
        ),
        loadPrivateWorkerPayload(
          env,
          session,
          '/api/admin/cohorts',
          'admin-cohorts',
          RESPONSE_LIMIT,
          CohortsSchema
        ),
        loadPrivateWorkerPayload(
          env,
          session,
          `/api/site/analytics/overview?days=${safeDays}`,
          'site-analytics',
          RESPONSE_LIMIT,
          SiteAnalyticsSchema
        ),
        loadPrivateWorkerPayload(
          env,
          session,
          `/api/site/analytics/geo?days=${safeDays}`,
          'site-geo',
          RESPONSE_LIMIT,
          GeoSchema
        ),
        loadPrivateWorkerPayload(
          env,
          session,
          `/api/docs/analytics/dashboard?days=${safeDays}`,
          'docs-analytics',
          RESPONSE_LIMIT,
          DocsAnalyticsSchema
        ),
      ],
      { concurrency: 'unbounded' }
    );
    return projectAnalytics(product, cohorts, site, geo, docs);
  });
}

/** Load grounded engagement, retention, adoption, risk, and expansion metrics. */
export function loadAdminInsights(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<AdminInsights, AdminIntelligenceError> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const payload = yield* loadPrivateWorkerPayload(
      env,
      session,
      '/api/admin/advanced-metrics',
      'admin-insights',
      RESPONSE_LIMIT,
      InsightsSchema
    );
    return projectInsights(payload);
  });
}

/** Load reconciled monthly and tier revenue aggregates. */
export function loadAdminRevenue(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<AdminRevenue, AdminIntelligenceError> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const payload = yield* loadPrivateWorkerPayload(
      env,
      session,
      '/api/admin/revenue',
      'admin-revenue',
      RESPONSE_LIMIT,
      RevenueSchema
    );
    return projectRevenue(payload);
  });
}
