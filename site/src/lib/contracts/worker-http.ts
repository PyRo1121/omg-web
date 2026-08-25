// Boundary parser internals decode remaining Worker JSON responses.

import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { D1Number, NullableStringSchema } from '../../../shared/d1-rows';

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

const JsonAtom = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

const Num = Schema.optionalWith(D1Number, { default: () => 0 });

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
/** Checkout session URL. */
export const CheckoutUrlSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.minLength(1)),
});

/** An email address decoded from a Worker response, safe for `mailto:` sinks. */
const ResponseEmail = Schema.String.pipe(Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u));

/** Billing portal payload. The URL must target Stripe's billing portal origin before `window.open`. */
export const PortalUrlSchema = Schema.Struct({
  success: Schema.Boolean,
  url: Schema.String.pipe(Schema.pattern(/^https:\/\/billing\.stripe\.com\//u)),
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
  email: ResponseEmail,
  company: NullableStringSchema,
  customer_tier: Str,
  created_at: Str,
  license_key: Str,
  tier: Str,
  status: Str,
  max_seats: Num,
  machine_count: Num,
  total_commands: Num,
  last_active: Schema.optional(NullableStringSchema),
  engagement_score: Num,
  lifecycle_stage: Str,
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
    email: ResponseEmail,
    company: NullableStringSchema,
    stripe_customer_id: Schema.optionalWith(NullableStringSchema, { default: () => null }),
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
        expires_at: NullableStringSchema,
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
          first_active: NullableStringSchema,
          last_active: NullableStringSchema,
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
      resource_type: NullableStringSchema,
      resource_id: NullableStringSchema,
      ip_address: NullableStringSchema,
      metadata: NullableStringSchema,
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
  /** Must match the worker-side create/update pattern; rendered into CSS color sinks. */
  color: Schema.String.pipe(Schema.pattern(/^#[0-9a-fA-F]{6}$/u)),
  description: NullableStringSchema,
  usage_count: Schema.optional(Schema.Number),
  created_at: Str,
});

export const TagsResponseSchema = Schema.Struct({
  tags: decodeNumArray(CustomerTagSchema),
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
      product_stickiness: Schema.optionalWith(
        Schema.Struct({
          daily_active_pct: Num,
          weekly_active_pct: Num,
          avg_days_between_sessions: Num,
        }),
        {
          default: () => ({
            daily_active_pct: 0,
            weekly_active_pct: 0,
            avg_days_between_sessions: 0,
          }),
        }
      ),
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
      company: NullableStringSchema,
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
      utm_source: NullableStringSchema,
      utm_medium: NullableStringSchema,
      utm_campaign: NullableStringSchema,
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
