import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AnalyticsPage from './+page.svelte';

const product = {
  commands_by_type: [],
  errors_by_type: [],
  growth: { new_users_7d: 4, new_paid_7d: 2, growth_rate: 10 },
  time_saved: { total_hours: 20 },
  funnel: { installs: 40, activated: 20, power_users: 5 },
  churn_risk: { at_risk_users: 1 },
  retention_rate: 70,
  performance: { avg_latency_ms: 10, min_ms: 2, max_ms: 30, query_count: 8 },
  sessions: {
    total_30d: 20,
    sessions_started: 10,
    heartbeats_sent: 10,
    avg_duration_seconds: 60,
    max_duration_seconds: 120,
  },
  user_journey: {
    funnel: {
      installed: 40,
      activated: 20,
      first_command: 15,
      exploring: 10,
      engaged: 8,
      power_user: 5,
    },
  },
  runtime_usage: [{ runtime: 'node', count: 12, machines: 4 }],
};

describe('operator analytics page', () => {
  it('renders site, product, cohort, geography, and docs aggregates', () => {
    const result = render(AnalyticsPage, {
      props: {
        params: {},
        data: {
          days: 30,
          analytics: {
            product,
            cohorts: [{ cohortMonth: '2026-08', monthIndex: 0, activeUsers: 12 }],
            site: {
              period_days: 30,
              summary: { total_pageviews: 300, total_visitors: 120, total_sessions: 150 },
              daily_trend: [],
              top_pages: [],
              top_referrers: [],
              device_breakdown: [],
            },
            geo: {
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
            },
            docs: {
              summary: {
                total_pageviews: 90,
                total_sessions: 30,
                avg_pages_per_session: '3.00',
                period_days: 30,
              },
              pageviews_over_time: [],
              top_pages: [{ path: '/docs/', views: 40, sessions: 20, avg_time: 75 }],
              top_referrers: [],
              utm_campaigns: [],
              geographic: [],
              top_interactions: [],
              performance: [],
            },
          },
        },
        form: null,
      },
    });

    expect(result.body).toContain('Product and site activity');
    expect(result.body).toContain('Documentation analytics');
    expect(result.body).toContain('Retention cohorts');
    expect(result.body).toContain('2026-08');
    expect(result.body).not.toContain('private-customer-id');
  });
});
