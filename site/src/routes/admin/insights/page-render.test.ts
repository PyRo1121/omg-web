import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import InsightsPage from './+page.svelte';

describe('operator insights page', () => {
  it('renders grounded adoption, risk, retention, and expansion signals', () => {
    const result = render(InsightsPage, {
      props: {
        params: {},
        data: {
          insights: {
            engagement: {
              dau: 10,
              wau: 40,
              mau: 100,
              stickiness: { daily_to_monthly: '10.0%', weekly_to_monthly: '40.0%' },
            },
            retention: [{ cohortDate: '2026-08-01', weekNumber: 1, retainedUsers: 8 }],
            ltvByTier: [{ tier: 'team', averageLtv: 240, customerCount: 4 }],
            featureAdoption: {
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
            commandHeatmap: [{ hour: '10', day_of_week: '2', event_count: 12 }],
            runtimeAdoption: [{ runtime: 'node', uniqueUsers: 8, totalUses: 20 }],
            churnRisk: [{ risk_segment: 'high', user_count: 2, tier: 'pro' }],
            expansionOpportunities: [
              {
                email: 'customer@example.com',
                tier: 'pro',
                activeMachines: 3,
                commands30d: 900,
                opportunityType: 'upsell_to_team',
                priority: 'medium',
              },
            ],
            timeToValue: { avg_days_to_activation: 2, pct_activated_week1: 75 },
            revenue: { current_mrr: 500, projected_arr: 6000, expansion_mrr_12m: 100 },
          },
        },
        form: null,
      },
    });

    expect(result.body).toContain('Adoption and account risk');
    expect(result.body).toContain('customer@example.com');
    expect(result.body).toContain('Weekly retention');
    expect(result.body).toContain('Command timing');
    expect(result.body).not.toContain('private-customer-id');
  });
});
