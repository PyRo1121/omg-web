import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import RevenuePage from './+page.svelte';

describe('operator revenue page', () => {
  it('labels ARR as run-rate and renders paid invoice aggregates', () => {
    const result = render(RevenuePage, {
      props: {
        params: {},
        data: {
          revenue: {
            mrr: 500,
            arr: 6000,
            monthly: [{ month: '2026-08', revenue: 450, transactions: 5 }],
            byTier: [{ tier: 'team', totalRevenue: 300, customers: 3 }],
          },
        },
        form: null,
      },
    });

    expect(result.body).toContain('Revenue intelligence');
    expect(result.body).toContain('Annual run rate');
    expect(result.body).toContain('ARR is the current MRR multiplied by twelve');
    expect(result.body).toContain('Stripe Tax remains disabled');
    expect(result.body).toContain('$500');
    expect(result.body).toContain('$6,000');
    expect(result.body).toContain('$450');
    expect(result.body).toContain('$300');
  });
});
