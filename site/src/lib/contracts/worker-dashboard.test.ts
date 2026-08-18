import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { decodeWorkerDashboard } from './worker-dashboard';

const validDashboard = {
  user: {
    id: 'cust_1',
    email: 'ada@example.com',
    name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  license: {
    id: 'lic_1',
    license_key: 'key_1',
    tier: 'free',
    status: 'active',
    max_machines: 1,
    expires_at: null,
    features: ['packages'],
  },
  machines: [],
  usage: {
    total_commands: 0,
    total_packages_installed: 0,
    total_packages_searched: 0,
    total_runtimes_switched: 0,
    total_sbom_generated: 0,
    total_vulnerabilities_found: 0,
    total_time_saved_ms: 0,
    current_streak: 0,
    longest_streak: 0,
    daily: [],
    breakdown: { installed: 0, searched: 0, switched: 0, sbom: 0, vulns: 0 },
  },
  achievements: [
    {
      id: 'first_install',
      emoji: '🎉',
      name: 'First Install',
      description: 'Installed OMG',
      unlocked: false,
    },
  ],
  subscription: null,
  invoices: [],
  is_admin: false,
  leaderboard: [],
  global_stats: {
    top_package: 'ripgrep',
    top_runtime: 'node',
    percentile: 100,
  },
};

describe('decodeWorkerDashboard', () => {
  it('accepts a complete Worker dashboard payload', async () => {
    const decoded = await Effect.runPromise(decodeWorkerDashboard(validDashboard));
    expect(decoded.user.email).toBe('ada@example.com');
    expect(decoded.license.tier).toBe('free');
    expect(decoded.is_admin).toBe(false);
  });

  it('rejects a payload missing the license block', async () => {
    const malformed = {
      user: validDashboard.user,
      machines: validDashboard.machines,
      usage: validDashboard.usage,
      achievements: validDashboard.achievements,
      subscription: validDashboard.subscription,
      invoices: validDashboard.invoices,
      is_admin: validDashboard.is_admin,
      leaderboard: validDashboard.leaderboard,
      global_stats: validDashboard.global_stats,
    };
    const exit = await Effect.runPromiseExit(decodeWorkerDashboard(malformed));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
