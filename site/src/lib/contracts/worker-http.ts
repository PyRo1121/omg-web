// Boundary parser internals decode remaining Worker JSON responses.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

/** A failure decoding a Worker JSON response. */
export class WorkerHttpParseError extends Error {
  readonly _tag = 'WorkerHttpParseError';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

const NullableString = Schema.Union(Schema.Null, Schema.String);
const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

const Num = Schema.optionalWith(
  Schema.Union(Schema.Number, Schema.Null).pipe(
    Schema.transform(Schema.Number, {
      decode: (fromA: number | null) => (fromA === null ? 0 : fromA),
      encode: (toI: number) => toI,
    })
  ),
  { default: () => 0 }
);

const Flag = Schema.Union(Schema.Boolean, Schema.Number).pipe(
  Schema.transform(Schema.Boolean, {
    decode: (fromA: boolean | number) => fromA === true || fromA === 1,
    encode: (toI: boolean) => (toI ? 1 : 0),
  })
);

const Str = Schema.optionalWith(
  Schema.Union(Schema.String, Schema.Null).pipe(
    Schema.transform(Schema.String, {
      decode: (fromA: string | null) => (fromA === null ? '' : fromA),
      encode: (toI: string) => toI,
    })
  ),
  { default: () => '' }
);

function decodeNumArray<S extends Schema.Schema.AnyNoContext>(schema: S) {
  return Schema.optionalWith(Schema.Array(schema), { default: () => [] });
}

/** `{ success: true }` mutation acknowledgement. */
export const SuccessSchema = Schema.Struct({
  success: Schema.Boolean,
});
export type Success = Schema.Schema.Type<typeof SuccessSchema>;

/** Checkout session URL. */
export const CheckoutUrlSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.minLength(1)),
});

/** Billing portal payload. */
export const PortalUrlSchema = Schema.Struct({
  success: Schema.Boolean,
  url: Schema.String.pipe(Schema.minLength(1)),
});

/** License regeneration payload. */
export const RegeneratedLicenseSchema = Schema.Struct({
  success: Schema.Boolean,
  license_key: Schema.String.pipe(Schema.minLength(1)),
  message: Str,
});

/** Created note id. */
export const CreatedNoteSchema = Schema.Struct({
  success: Schema.Boolean,
  note_id: Schema.String.pipe(Schema.minLength(1)),
});

/** Created tag id. */
export const CreatedTagSchema = Schema.Struct({
  success: Schema.Boolean,
  tag_id: Schema.String.pipe(Schema.minLength(1)),
});

/** Site tracking acknowledgement. */
export const TrackedEventsSchema = Schema.Struct({
  success: Schema.Boolean,
  processed: Num,
});

const SessionSchema = Schema.Struct({
  id: Schema.String,
  ip_address: NullableString,
  user_agent: NullableString,
  created_at: Schema.String,
  expires_at: Schema.String,
  is_current: Flag,
});

export const SessionsResponseSchema = Schema.Struct({
  sessions: decodeNumArray(SessionSchema),
});

const AuditLogEntrySchema = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  resource_type: NullableString,
  resource_id: NullableString,
  ip_address: NullableString,
  created_at: Schema.String,
});

export const AuditLogResponseSchema = Schema.Struct({
  logs: decodeNumArray(AuditLogEntrySchema),
});

const TeamMemberSchema = Schema.Struct({
  id: Schema.String,
  machine_id: Schema.String,
  hostname: NullableString,
  os: NullableString,
  arch: NullableString,
  omg_version: NullableString,
  user_name: Schema.optional(NullableString),
  user_email: Schema.optional(NullableString),
  is_active: Flag,
  first_seen_at: Str,
  last_seen_at: Str,
  total_commands: Num,
  total_packages: Num,
  total_time_saved_ms: Num,
  commands_last_7d: Num,
  last_active: Schema.optional(NullableString),
});

export const TeamDataSchema = Schema.Struct({
  license: Schema.Struct({
    tier: Str,
    max_seats: Num,
    status: Str,
  }),
  members: decodeNumArray(TeamMemberSchema),
  daily_usage: decodeNumArray(
    Schema.Struct({
      date: Str,
      machine_id: Str,
      commands_run: Num,
      time_saved_ms: Num,
    })
  ),
  totals: Schema.Struct({
    total_machines: Num,
    active_machines: Num,
    total_commands: Num,
    total_time_saved_ms: Num,
    total_time_saved_hours: Num,
    total_value_usd: Num,
  }),
  fleet_health: Schema.Struct({
    compliance_rate: Num,
    latest_version: Str,
    version_drift: Flag,
  }),
  productivity_score: Num,
  insights: Schema.Struct({
    engagement_rate: Num,
    roi_multiplier: Str,
  }),
});

const PolicySchema = Schema.Struct({
  id: Schema.String,
  scope: Schema.String,
  rule: Schema.String,
  value: Schema.String,
  enforced: Flag,
  created_at: Str,
});

export const PoliciesResponseSchema = Schema.Struct({
  policies: decodeNumArray(PolicySchema),
});

const NotificationSettingSchema = Schema.Struct({
  type: Str,
  enabled: Flag,
  threshold: Schema.optional(Schema.Number),
  channels: decodeNumArray(Schema.String),
});

export const NotificationsResponseSchema = Schema.Struct({
  settings: decodeNumArray(NotificationSettingSchema),
});

const TeamAuditLogEntrySchema = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  resource_type: NullableString,
  resource_id: NullableString,
  ip_address: NullableString,
  user_agent: NullableString,
  metadata: NullableString,
  created_at: Schema.String,
});

export const TeamAuditLogsResponseSchema = Schema.Struct({
  logs: decodeNumArray(TeamAuditLogEntrySchema),
  total: Num,
  limit: Num,
  offset: Num,
});

export const AdminOverviewSchema = Schema.Struct({
  overview: Schema.Struct({
    total_users: Num,
    active_licenses: Num,
    active_machines: Num,
    total_installs: Num,
    total_commands: Num,
    mrr: Num,
    global_value_usd: Num,
    command_health: Schema.Struct({
      success: Num,
      failure: Num,
    }),
  }),
  fleet: Schema.Struct({
    versions: decodeNumArray(Schema.Struct({ omg_version: Str, count: Num })),
  }),
  tiers: decodeNumArray(Schema.Struct({ tier: Str, count: Num })),
  usage: Schema.Struct({
    total_commands: Num,
    total_packages_installed: Num,
    total_searches: Num,
    total_time_saved_ms: Num,
  }),
  daily_active_users: decodeNumArray(
    Schema.Struct({ date: Str, active_users: Num, commands: Num })
  ),
  recent_signups: decodeNumArray(Schema.Struct({ date: Str, count: Num })),
  installs_by_platform: decodeNumArray(Schema.Struct({ platform: Str, count: Num })),
  installs_by_version: decodeNumArray(Schema.Struct({ version: Str, count: Num })),
  subscriptions: decodeNumArray(Schema.Struct({ status: Str, count: Num })),
  geo_distribution: decodeNumArray(Schema.Struct({ dimension: Str, count: Num })),
});

export const AdminAnalyticsSchema = Schema.Struct({
  request_id: Str,
  dau: Num,
  wau: Num,
  mau: Num,
  events_today: Num,
  retention_rate: Num,
  commands_by_type: decodeNumArray(Schema.Struct({ command: Str, count: Num })),
  errors_by_type: decodeNumArray(Schema.Struct({ error_type: Str, count: Num })),
  growth: Schema.optionalWith(
    Schema.Struct({
      new_users_7d: Num,
      new_paid_7d: Num,
      growth_rate: Num,
    }),
    { default: () => ({ new_users_7d: 0, new_paid_7d: 0, growth_rate: 0 }) }
  ),
  time_saved: Schema.optionalWith(Schema.Struct({ total_hours: Num }), {
    default: () => ({ total_hours: 0 }),
  }),
  funnel: Schema.optionalWith(
    Schema.Struct({
      installs: Num,
      activated: Num,
      power_users: Num,
    }),
    { default: () => ({ installs: 0, activated: 0, power_users: 0 }) }
  ),
  churn_risk: Schema.optionalWith(Schema.Struct({ at_risk_users: Num }), {
    default: () => ({ at_risk_users: 0 }),
  }),
});

const FirehoseEventSchema = Schema.Struct({
  id: Schema.String,
  event_type: Schema.String,
  event_name: Schema.String,
  properties: Schema.optional(Schema.Record({ key: Schema.String, value: JsonAtom })),
  timestamp: Schema.String,
  session_id: Schema.String,
  machine_id: Schema.String,
  version: Schema.String,
  platform: Schema.String,
  duration_ms: Schema.optional(Schema.Number),
  created_at: Schema.String,
});

export const FirehoseResponseSchema = Schema.Struct({
  events: decodeNumArray(FirehoseEventSchema),
});

const AdminUserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  company: NullableString,
  customer_tier: Str,
  created_at: Str,
  license_key: Str,
  tier: Str,
  status: Str,
  max_seats: Num,
  machine_count: Num,
  total_commands: Num,
  last_active: Schema.optional(NullableString),
  engagement_score: Schema.optional(Schema.Number),
  lifecycle_stage: Schema.optional(Schema.String),
});

export const AdminUsersResponseSchema = Schema.Struct({
  users: decodeNumArray(AdminUserSchema),
  pagination: Schema.Struct({
    page: Num,
    limit: Num,
    total: Num,
    pages: Num,
  }),
});

export const AdminUserDetailSchema = Schema.Struct({
  request_id: Str,
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    company: NullableString,
    stripe_customer_id: Schema.optionalWith(NullableString, { default: () => null }),
    tier: Str,
    created_at: Str,
    created_at_relative: Str,
  }),
  license: Schema.optionalWith(
    Schema.Union(
      Schema.Null,
      Schema.Struct({
        id: Schema.String,
        license_key: Schema.String,
        tier: Str,
        status: Str,
        max_seats: Num,
        expires_at: NullableString,
      })
    ),
    { default: () => null }
  ),
  machines: decodeNumArray(
    Schema.Struct({
      id: Schema.String,
      machine_id: Schema.String,
      hostname: Str,
      os: Str,
      arch: Str,
      omg_version: Str,
      is_active: Flag,
      first_seen_at: Str,
      last_seen_at: Str,
    })
  ),
  usage: Schema.Struct({
    daily: decodeNumArray(
      Schema.Struct({
        date: Str,
        commands_run: Num,
        packages_installed: Num,
        time_saved_ms: Num,
      })
    ),
    summary: Schema.optionalWith(
      Schema.Union(
        Schema.Null,
        Schema.Struct({
          total_commands: Num,
          total_packages: Num,
          total_searches: Num,
          total_time_saved_ms: Num,
          active_days: Num,
          first_active: NullableString,
          last_active: NullableString,
        })
      ),
      { default: () => null }
    ),
  }),
  engagement: Schema.Struct({
    commands_last_7d: Num,
    commands_last_30d: Num,
    active_days_last_30d: Num,
    avg_daily_commands: Num,
    is_power_user: Flag,
    is_at_risk: Flag,
  }),
  ltv: Schema.Struct({
    total_paid: Num,
    invoice_count: Num,
    months_subscribed: Num,
  }),
});

const AdminActivitySchema = Schema.Struct({
  id: Schema.String,
  type: Str,
  description: Str,
  user_id: Str,
  user_email: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  hostname: Schema.optional(Schema.String),
  platform: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  timestamp: Str,
  created_at: Str,
});

export const AdminActivityResponseSchema = Schema.Struct({
  activity: decodeNumArray(AdminActivitySchema),
});

export const AdminHealthSchema = Schema.Struct({
  active_users_today: Num,
  active_users_week: Num,
  commands_today: Num,
  new_users_today: Num,
  installs_today: Num,
  timestamp: Str,
});

export const AdminCohortsSchema = Schema.Struct({
  request_id: Str,
  cohorts: decodeNumArray(
    Schema.Struct({
      cohort_week: Str,
      weeks_since_signup: Num,
      active_users: Num,
    })
  ),
});

export const AdminRevenueSchema = Schema.Struct({
  request_id: Str,
  mrr: Num,
  arr: Num,
  monthly_revenue: decodeNumArray(Schema.Struct({ month: Str, revenue: Num, transactions: Num })),
});

export const AdminAuditLogResponseSchema = Schema.Struct({
  request_id: Str,
  logs: decodeNumArray(
    Schema.Struct({
      id: Schema.String,
      user_id: Str,
      user_email: Str,
      action: Schema.String,
      resource_type: NullableString,
      resource_id: NullableString,
      ip_address: NullableString,
      metadata: NullableString,
      created_at: Schema.String,
    })
  ),
  pagination: Schema.Struct({
    page: Num,
    limit: Num,
    total: Num,
    pages: Num,
  }),
});

const CustomerNoteSchema = Schema.Struct({
  id: Schema.String,
  customer_id: Schema.String,
  content: Schema.String,
  note_type: Schema.String,
  is_pinned: Num,
  author_id: Schema.String,
  author_email: Schema.optional(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});

export const NotesResponseSchema = Schema.Struct({
  notes: decodeNumArray(CustomerNoteSchema),
});

const CustomerTagSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  description: NullableString,
  usage_count: Schema.optional(Schema.Number),
  created_at: Str,
});

export const TagsResponseSchema = Schema.Struct({
  tags: decodeNumArray(CustomerTagSchema),
});

export const CustomerHealthResponseSchema = Schema.Struct({
  health: Schema.Struct({
    customer_id: Schema.String,
    overall_score: Num,
    engagement_score: Num,
    activation_score: Num,
    growth_score: Num,
    risk_score: Num,
    lifecycle_stage: Str,
    updated_at: NullableString,
  }),
});

export const AdminAdvancedMetricsSchema = Schema.Struct({
  request_id: Str,
  engagement: Schema.Struct({
    dau: Num,
    wau: Num,
    mau: Num,
    stickiness: Schema.Struct({
      daily_to_monthly: Str,
      weekly_to_monthly: Str,
    }),
  }),
  retention: Schema.optional(
    Schema.Struct({
      cohorts: decodeNumArray(
        Schema.Struct({
          cohort_date: Str,
          week_number: Str,
          retained_users: Num,
        })
      ),
      product_stickiness: Schema.Struct({
        daily_active_pct: Num,
        weekly_active_pct: Num,
        avg_days_between_sessions: Num,
      }),
    })
  ),
  ltv_by_tier: decodeNumArray(
    Schema.Struct({
      avg_ltv: Num,
      tier: Str,
      customer_count: Num,
    })
  ),
  feature_adoption: Schema.optional(
    Schema.Struct({
      total_installs: Num,
      total_searches: Num,
      total_runtime_switches: Num,
      total_sbom: Num,
      total_vulns: Num,
      install_adopters: Num,
      search_adopters: Num,
      runtime_adopters: Num,
      sbom_adopters: Num,
      total_active_users: Num,
    })
  ),
  command_heatmap: decodeNumArray(
    Schema.Struct({
      hour: Str,
      day_of_week: Str,
      event_count: Num,
    })
  ),
  runtime_adoption: decodeNumArray(
    Schema.Struct({
      runtime: Str,
      unique_users: Num,
      total_uses: Num,
      avg_duration_ms: Num,
    })
  ),
  churn_risk_segments: decodeNumArray(
    Schema.Struct({
      risk_segment: Str,
      user_count: Num,
      avg_monthly_commands: Num,
      tier: Str,
    })
  ),
  expansion_opportunities: decodeNumArray(
    Schema.Struct({
      customer_id: Str,
      email: Str,
      company: NullableString,
      tier: Str,
      active_machines: Num,
      max_seats: Num,
      total_commands_30d: Num,
      hours_saved_30d: Num,
      opportunity_type: Str,
      priority: Str,
    })
  ),
  time_to_value: Schema.optional(
    Schema.Struct({
      avg_days_to_activation: Num,
      avg_days_to_power_user: Num,
      pct_activated_day1: Num,
      pct_activated_week1: Num,
      pct_became_power_users: Num,
    })
  ),
  revenue_metrics: Schema.optional(
    Schema.Struct({
      current_mrr: Num,
      projected_arr: Num,
      expansion_mrr_12m: Num,
      months_tracked: Num,
    })
  ),
});

export const DocsAnalyticsDashboardSchema = Schema.Struct({
  summary: Schema.Struct({
    total_pageviews: Num,
    total_sessions: Num,
    avg_pages_per_session: Str,
    period_days: Num,
  }),
  pageviews_over_time: decodeNumArray(Schema.Struct({ date: Str, views: Num, sessions: Num })),
  top_pages: decodeNumArray(Schema.Struct({ path: Str, views: Num, sessions: Num, avg_time: Num })),
  top_referrers: decodeNumArray(Schema.Struct({ referrer: Str, sessions: Num, pageviews: Num })),
  utm_campaigns: decodeNumArray(
    Schema.Struct({
      utm_source: NullableString,
      utm_medium: NullableString,
      utm_campaign: NullableString,
      sessions: Num,
      pageviews: Num,
    })
  ),
  geographic: decodeNumArray(Schema.Struct({ country_code: Str, sessions: Num, pageviews: Num })),
  top_interactions: decodeNumArray(
    Schema.Struct({ interaction_type: Str, target: Str, count: Num })
  ),
  performance: decodeNumArray(
    Schema.Struct({ path: Str, avg_load: Num, p95_load: Num, samples: Num })
  ),
});

export const SiteGeoAnalyticsSchema = Schema.Struct({
  period_days: Num,
  total_countries: Num,
  total_engagement: Num,
  geo_distribution: decodeNumArray(
    Schema.Struct({
      country_code: Str,
      user_count: Num,
      percentage: Num,
      breakdown: Schema.Struct({
        site_visitors: Num,
        docs_sessions: Num,
        cli_installs: Num,
      }),
    })
  ),
  by_source: Schema.Struct({
    site: Num,
    docs: Num,
    cli: Num,
  }),
});

export const SiteRealtimeAnalyticsSchema = Schema.Struct({
  active_visitors: Num,
  by_country: decodeNumArray(Schema.Struct({ country_code: Str, count: Num })),
  top_pages: decodeNumArray(Schema.Struct({ page_path: Str, count: Num })),
  timestamp: Num,
});

export const SiteAnalyticsOverviewSchema = Schema.Struct({
  period_days: Num,
  summary: Schema.Struct({
    total_pageviews: Num,
    total_visitors: Num,
    total_sessions: Num,
  }),
  daily_trend: decodeNumArray(Schema.Struct({ date: Str, pageviews: Num, visitors: Num })),
  top_pages: decodeNumArray(Schema.Struct({ path: Str, views: Num, visitors: Num })),
  top_referrers: decodeNumArray(
    Schema.Struct({ referrer_domain: Str, visitors: Num, pageviews: Num })
  ),
  device_breakdown: decodeNumArray(Schema.Struct({ device_type: Str, visitors: Num })),
});

export const AdminStripeMetricsSchema = Schema.Struct({
  mrr: Num,
  arr: Num,
  active_subscriptions: Num,
  tier_breakdown: Schema.Struct({
    pro: Num,
    team: Num,
    enterprise: Num,
  }),
  balance: Schema.Struct({
    available: Num,
    pending: Num,
    currency: Str,
  }),
});

export const AdminStripeSyncResultSchema = Schema.Struct({
  customers_synced: Num,
  subscriptions_synced: Num,
  invoices_synced: Num,
  errors: decodeNumArray(Schema.String),
});

/**
 * Decode an untrusted Worker JSON response.
 *
 * @param schema - Response schema.
 * @param reason - Parse error reason.
 * @param value - Raw JSON.
 * @returns The typed payload, or `WorkerHttpParseError`.
 */
export function decodeWorkerHttp<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<Schema.Schema.Type<S>, WorkerHttpParseError> {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      (cause: unknown): WorkerHttpParseError => new WorkerHttpParseError(reason, cause)
    )
  );
}
