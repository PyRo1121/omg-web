import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  loadAdminAnalytics,
  loadAdminInsights,
  loadAdminRevenue,
} from './admin-intelligence.server';
import type { LicensingSummaryEnvironment } from './licensing-service.server';

const identity = {
  id: 'better-auth-admin',
  email: 'operator@example.com',
  name: 'Operator',
  emailVerified: true,
};

const product = {
  commands_by_type: [{ command: 'install', count: 20 }],
  errors_by_type: [],
  growth: { new_users_7d: 4, new_paid_7d: 2, growth_rate: 12.5 },
  time_saved: { total_hours: 80 },
  funnel: { installs: 100, activated: 40, power_users: 8 },
  churn_risk: { at_risk_users: 3 },
  retention_rate: 67,
  performance: { avg_latency_ms: 12, min_ms: 2, max_ms: 40, query_count: 50 },
  sessions: {
    total_30d: 120,
    sessions_started: 80,
    heartbeats_sent: 40,
    avg_duration_seconds: 600,
    max_duration_seconds: 3600,
  },
  user_journey: {
    funnel: {
      installed: 100,
      activated: 40,
      first_command: 32,
      exploring: 20,
      engaged: 12,
      power_user: 8,
    },
  },
  runtime_usage: [{ runtime: 'node', count: 30, machines: 12 }],
};

const insights = {
  engagement: {
    dau: 10,
    wau: 40,
    mau: 100,
    stickiness: { daily_to_monthly: '10.0%', weekly_to_monthly: '40.0%' },
  },
  retention: { cohorts: [{ cohort_date: '2026-08-01', week_number: 1, retained_users: 8 }] },
  ltv_by_tier: [{ avg_ltv: 240, tier: 'team', customer_count: 4 }],
  feature_adoption: {
    total_installs: 100,
    total_searches: 80,
    total_runtime_switches: 20,
    total_sbom: 10,
    total_vulns: 4,
    install_adopters: 50,
    search_adopters: 40,
    runtime_adopters: 12,
    sbom_adopters: 8,
    total_active_users: 60,
  },
  command_heatmap: [{ hour: '10', day_of_week: '2', event_count: 12 }],
  runtime_adoption: [{ runtime: 'node', unique_users: 8, total_uses: 20 }],
  churn_risk_segments: [{ risk_segment: 'high', user_count: 2, tier: 'pro' }],
  expansion_opportunities: [
    {
      customer_id: 'private-customer-id',
      email: 'customer@example.com',
      tier: 'pro',
      active_machines: 3,
      total_commands_30d: 900,
      opportunity_type: 'upsell_to_team',
      priority: 'medium',
    },
  ],
  time_to_value: { avg_days_to_activation: 2, pct_activated_week1: 75 },
  revenue_metrics: { current_mrr: 500, projected_arr: 6000, expansion_mrr_12m: 100 },
};

class IntelligenceServiceStub {
  readonly paths: Array<string> = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.paths.push(`${url.pathname}${url.search}`);
    switch (url.pathname) {
      case '/api/internal/site-session':
        return Response.json({
          token: 'server-only-token',
          expiresAt: '2026-09-01T00:00:00.000Z',
          customerId: 'operator-id',
        });
      case '/api/admin/analytics':
        return Response.json(product);
      case '/api/admin/cohorts':
        return Response.json({
          cohorts: [{ cohort_month: '2026-08', month_index: 0, active_users: 12 }],
        });
      case '/api/site/analytics/overview':
        return Response.json({
          period_days: 30,
          summary: { total_pageviews: 300, total_visitors: 120, total_sessions: 150 },
          daily_trend: [{ date: '2026-08-28', pageviews: 20, visitors: 10 }],
          top_pages: [{ path: '/', views: 100, visitors: 80 }],
          top_referrers: [{ referrer_domain: 'github.com', visitors: 30, pageviews: 40 }],
          device_breakdown: [{ device_type: 'desktop', visitors: 90 }],
        });
      case '/api/site/analytics/geo':
        return Response.json({
          period_days: 30,
          total_countries: 1,
          total_engagement: 50,
          geo_distribution: [
            {
              country_code: 'US',
              user_count: 50,
              percentage: 100,
              breakdown: { site_visitors: 30, docs_sessions: 10, cli_installs: 5 },
            },
          ],
          by_source: { site: 1, docs: 1, cli: 1 },
        });
      case '/api/docs/analytics/dashboard':
        return Response.json({
          summary: {
            total_pageviews: 90,
            total_sessions: 30,
            avg_pages_per_session: '3.00',
            period_days: 30,
          },
          pageviews_over_time: [{ date: '2026-08-28', views: 12, sessions: 4 }],
          top_pages: [{ path: '/docs/', views: 40, sessions: 20, avg_time: 75 }],
          top_referrers: [{ referrer: 'github.com', sessions: 10, pageviews: 20 }],
          utm_campaigns: [
            {
              utm_source: 'github',
              utm_medium: 'social',
              utm_campaign: 'launch',
              sessions: 8,
              pageviews: 16,
            },
          ],
          geographic: [{ country_code: 'US', sessions: 20, pageviews: 60 }],
          top_interactions: [{ interaction_type: 'copy', target: 'install', count: 9 }],
          performance: [{ path: '/docs/', avg_load: 120, p95_load: 240, samples: 15 }],
        });
      case '/api/admin/advanced-metrics':
        return Response.json(insights);
      case '/api/admin/revenue':
        return Response.json({
          mrr: 500,
          arr: 6000,
          monthly_revenue: [{ month: '2026-08', revenue: 450, transactions: 5 }],
          revenue_by_tier: [{ tier: 'team', total_revenue: 300, customers: 3 }],
        });
      default:
        return Response.json({ error: 'not found' }, { status: 404 });
    }
  }
}

function environment(service: IntelligenceServiceStub): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => ({ role: 'admin' }) }) }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-secret',
  };
}

describe('admin intelligence service', () => {
  it('loads route-local product, site, geographic, and cohort analytics', async () => {
    const service = new IntelligenceServiceStub();
    const value = await Effect.runPromise(loadAdminAnalytics(identity, environment(service), 30));

    expect(value.product.growth.new_users_7d).toBe(4);
    expect(value.cohorts).toEqual([{ cohortMonth: '2026-08', monthIndex: 0, activeUsers: 12 }]);
    expect(value.site.summary.total_visitors).toBe(120);
    expect(value.geo.geo_distribution[0]?.country_code).toBe('US');
    expect(service.paths).toEqual([
      '/api/internal/site-session',
      '/api/admin/analytics',
      '/api/admin/cohorts',
      '/api/site/analytics/overview?days=30',
      '/api/site/analytics/geo?days=30',
      '/api/docs/analytics/dashboard?days=30',
    ]);
    expect(value.docs.summary.total_pageviews).toBe(90);
  });

  it('projects insights without private customer identifiers', async () => {
    const service = new IntelligenceServiceStub();
    const value = await Effect.runPromise(loadAdminInsights(identity, environment(service)));

    expect(value.expansionOpportunities).toEqual([
      {
        email: 'customer@example.com',
        tier: 'pro',
        activeMachines: 3,
        commands30d: 900,
        opportunityType: 'upsell_to_team',
        priority: 'medium',
      },
    ]);
    expect(JSON.stringify(value)).not.toContain('private-customer-id');
  });

  it('loads only grounded revenue aggregates', async () => {
    const service = new IntelligenceServiceStub();
    const value = await Effect.runPromise(loadAdminRevenue(identity, environment(service)));

    expect(value).toEqual({
      mrr: 500,
      arr: 6000,
      monthly: [{ month: '2026-08', revenue: 450, transactions: 5 }],
      byTier: [{ tier: 'team', totalRevenue: 300, customers: 3 }],
    });
  });
});
