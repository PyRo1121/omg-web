import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import {
  createAccountAnalyticsExport,
  loadAccountAnalytics,
  loadAccountAnalyticsState,
} from './account-analytics.server';
import { siteSessionResponse } from './test-utils';

const identity = {
  id: 'better-auth-user-1',
  email: 'ada@example.com',
  name: 'Ada',
  emailVerified: true,
};

const dashboardPayload = {
  license: { id: 'license-id', license_key: 'raw-license-key' },
  usage: {
    total_commands: 12,
    total_packages_installed: 4,
    total_packages_searched: 9,
    total_runtimes_switched: 2,
    total_sbom_generated: 3,
    total_vulnerabilities_found: 1,
    total_time_saved_ms: 90_000,
    current_streak: 2,
    longest_streak: 5,
    daily: [
      { date: '2026-08-27', commands_run: 5, time_saved_ms: 30_000 },
      { date: '2026-08-28', commands_run: 7, time_saved_ms: 60_000 },
    ],
    breakdown: { installed: 4, searched: 9, switched: 2, sbom: 3, vulns: 1 },
  },
  global_stats: { top_package: 'ripgrep', top_runtime: 'node', percentile: 88 },
};

class AnalyticsServiceStub {
  readonly requests: Array<Request> = [];
  constructor(private readonly dashboardResponse: () => Response) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push(request.clone());
    if (request.url.endsWith('/api/internal/site-session')) {
      return siteSessionResponse({ expiresAt: '2026-08-28T13:00:00.000Z' });
    }
    return this.dashboardResponse();
  }
}

function environment(service: AnalyticsServiceStub): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ role: 'user' }) }),
      }),
    },
    SVELTE_BFF_SECRET: 'private-secret',
    LICENSING_API: service,
  };
}

describe('account analytics service', () => {
  it('projects bounded account usage without license or customer identifiers', async () => {
    const service = new AnalyticsServiceStub(() => Response.json(dashboardPayload));

    const result = await Effect.runPromise(loadAccountAnalytics(identity, environment(service)));

    expect(result).toEqual({
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
      daily: [
        { date: '2026-08-27', commands: 5, timeSavedMs: 30_000 },
        { date: '2026-08-28', commands: 7, timeSavedMs: 60_000 },
      ],
      breakdown: { installed: 4, searched: 9, switched: 2, sbom: 3, vulnerabilities: 1 },
      dimensions: { topPackage: 'ripgrep', topRuntime: 'node', percentile: 88 },
    });
    expect(JSON.stringify(result)).not.toContain('raw-license-key');
    expect(JSON.stringify(result)).not.toContain('license-id');
    expect(service.requests[1]?.url).toBe('https://omg-saas.internal/api/dashboard');
    expect(service.requests[1]?.headers.get('Authorization')).toBe('Bearer server-only-token');
  });

  it('returns verification-required without contacting private services', async () => {
    const service = new AnalyticsServiceStub(() => Response.json(dashboardPayload));

    const state = await loadAccountAnalyticsState(
      { ...identity, emailVerified: false },
      environment(service)
    );

    expect(state).toEqual({ status: 'verification-required' });
    expect(service.requests).toHaveLength(0);
  });

  it('localizes malformed analytics as an unavailable state', async () => {
    const service = new AnalyticsServiceStub(() =>
      Response.json({
        ...dashboardPayload,
        usage: { ...dashboardPayload.usage, total_commands: -1 },
      })
    );

    const state = await loadAccountAnalyticsState(identity, environment(service));

    expect(state).toEqual({ status: 'unavailable' });
  });

  it('rejects malformed analytics at the Worker boundary', async () => {
    const service = new AnalyticsServiceStub(() =>
      Response.json({
        ...dashboardPayload,
        usage: { ...dashboardPayload.usage, total_commands: -1 },
      })
    );

    const exit = await Effect.runPromiseExit(loadAccountAnalytics(identity, environment(service)));

    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('account analytics exports', () => {
  it('creates server-owned CSV and JSON downloads from the safe projection', async () => {
    const service = new AnalyticsServiceStub(() => Response.json(dashboardPayload));
    const analytics = await Effect.runPromise(loadAccountAnalytics(identity, environment(service)));

    const csv = createAccountAnalyticsExport(analytics, 'csv', new Date('2026-08-28T12:00:00Z'));
    const json = createAccountAnalyticsExport(analytics, 'json', new Date('2026-08-28T12:00:00Z'));

    expect(csv).toEqual({
      body: 'Date,Commands,Time saved (ms)\n2026-08-27,5,30000\n2026-08-28,7,60000',
      contentType: 'text/csv; charset=utf-8',
      filename: 'omg-usage-2026-08-28.csv',
    });
    expect(json.filename).toBe('omg-usage-2026-08-28.json');
    expect(JSON.parse(json.body)).toEqual(analytics);
    expect(json.body).not.toContain('raw-license-key');
  });
});
