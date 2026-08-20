import { Effect, Exit } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { createDashboardView, type DashboardFetch } from '../state/dashboard-view';
import { parseLicensingDashboard } from './licensing-dashboard';

const canonicalDashboard = {
  user: {
    id: 'customer_1',
    email: 'ada@example.com',
    name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  license: {
    id: 'license_1',
    license_key: 'OMG-TEST',
    tier: 'pro',
    status: 'active',
    max_machines: 3,
    expires_at: null,
    features: ['telemetry'],
  },
  machines: [
    {
      id: 'machine_1',
      machine_id: 'host_1',
      hostname: 'workstation',
      os: 'linux',
      arch: 'x64',
      omg_version: '1.0.0',
      first_seen_at: '2026-01-01T00:00:00.000Z',
      last_seen_at: '2026-01-02T00:00:00.000Z',
      is_active: 1,
    },
  ],
  usage: {
    total_commands: 10,
    total_packages_installed: 2,
    total_packages_searched: 3,
    total_runtimes_switched: 1,
    total_sbom_generated: 1,
    total_vulnerabilities_found: 0,
    total_time_saved_ms: 5000,
    current_streak: 2,
    longest_streak: 3,
    daily: [{ date: '2026-01-02', commands_run: 10, time_saved_ms: 5000 }],
    breakdown: { installed: 2, searched: 3, switched: 1, sbom: 1, vulns: 0 },
  },
  achievements: [
    {
      id: 'first-command',
      emoji: '🚀',
      name: 'First Command',
      description: 'Run one command',
      unlocked: true,
      unlocked_at: '2026-01-02T00:00:00.000Z',
    },
  ],
  subscription: null,
  invoices: [],
  is_admin: false,
  leaderboard: [],
  global_stats: { top_package: 'ripgrep', top_runtime: 'node', percentile: 90 },
};

describe('parseLicensingDashboard', () => {
  it('projects the canonical Worker payload into the dashboard view contract', async () => {
    const dashboard = await Effect.runPromise(parseLicensingDashboard(canonicalDashboard));

    expect(dashboard.user).toMatchObject({ name: 'ada@example.com', role: 'user' });
    expect(dashboard.daily[0]).toMatchObject({ packages_installed: 0, packages_searched: 0 });
    expect(dashboard.achievements[0]).toMatchObject({ progress: 100, unlocked: true });
  });

  it('rejects malformed Worker payloads as typed failures', async () => {
    const exit = await Effect.runPromiseExit(
      parseLicensingDashboard({ ...canonicalDashboard, usage: null })
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('loads canonical telemetry through one same-origin licensing BFF request', async () => {
    const requestedPaths: string[] = [];
    const fetcher: DashboardFetch = async input => {
      requestedPaths.push(input);
      return Response.json({ invalid: true });
    };
    const view = createDashboardView(fetcher);

    view.loadTelemetry();

    await vi.waitFor(() => expect(view.telemetryLoading()).toBe(false));
    expect(requestedPaths).toEqual(['/api/licensing/api/dashboard']);
    expect(view.telemetryError()).toBe('Licensing dashboard has an invalid shape');
  });
});
