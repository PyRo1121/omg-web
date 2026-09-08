import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AnalyticsPage from './+page.svelte';

const analytics = {
  totals: {
    commands: 12,
    packagesInstalled: 4,
    packagesSearched: 9,
    runtimeSwitches: 2,
    sbomsGenerated: 3,
    vulnerabilitiesFound: 1,
    timeSavedMs: 90_000,
  },
  streaks: { current: 2, longest: 5 },
  daily: [{ date: '2026-08-28', commands: 7, timeSavedMs: 60_000 }],
  breakdown: { installed: 4, searched: 9, switched: 2, sbom: 3, vulnerabilities: 1 },
  dimensions: { topPackage: 'ripgrep', topRuntime: 'node', percentile: 88 },
};

describe('account analytics page', () => {
  it('renders grounded usage and server-owned export links', () => {
    const result = render(AnalyticsPage, {
      props: { data: { analytics: { status: 'available', analytics } }, form: null, params: {} },
    });

    expect(result.body).toContain('Account analytics');
    expect(result.body).toContain('href="/dashboard/analytics/export/csv"');
    expect(result.body).toContain('href="/dashboard/analytics/export/json"');
    expect(result.body).toContain('ripgrep');
    expect(result.body).toContain('Percentile 88');
    expect(result.body).not.toContain('license_key');
    expect(result.body).not.toContain('machine_id');
  });

  it('renders explicit empty and unavailable states', () => {
    const empty = render(AnalyticsPage, {
      props: {
        data: {
          analytics: {
            status: 'available',
            analytics: { ...analytics, daily: [] },
          },
        },
        form: null,
        params: {},
      },
    });
    const unavailable = render(AnalyticsPage, {
      props: { data: { analytics: { status: 'unavailable' } }, form: null, params: {} },
    });

    expect(empty.body).toContain('No daily activity has been reported yet.');
    expect(unavailable.body).toContain('Analytics are temporarily unavailable.');
  });
});
