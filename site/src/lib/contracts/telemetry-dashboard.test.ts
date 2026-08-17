import { describe, expect, it } from 'vitest';
import { decodeTelemetryDashboard } from './telemetry-dashboard';

const validPayload = {
  user: { id: 'u1', email: 'a@b.c', name: 'A', role: 'user' },
  license: {
    id: 'l1',
    license_key: 'KEY-123',
    tier: 'pro',
    status: 'active',
    max_machines: 3,
    expires_at: null,
    features: ['fleet'],
  },
  usage: {
    total_commands: 1,
    total_packages_installed: 2,
    total_packages_searched: 3,
    total_runtimes_switched: 4,
    total_sbom_generated: 5,
    total_vulnerabilities_found: 6,
    total_time_saved_ms: 7,
  },
  daily: [
    {
      date: '2025-01-01',
      commands_run: 1,
      packages_installed: 0,
      packages_searched: 0,
      time_saved_ms: 0,
    },
  ],
  machines: [
    {
      id: 'm1',
      machine_id: 'mac-1',
      hostname: null,
      os: null,
      arch: null,
      omg_version: null,
      is_active: 1,
      last_seen_at: '2025-01-01',
    },
  ],
  achievements: [],
  global_stats: { top_package: 'ripgrep', top_runtime: 'node', percentile: 50 },
};

describe('decodeTelemetryDashboard', () => {
  it('decodes a valid telemetry payload with branded identifiers', () => {
    const decoded = decodeTelemetryDashboard(validPayload);
    expect(decoded).not.toBeNull();
    expect(decoded?.user.id).toBe('u1');
    expect(decoded?.license.license_key).toBe('KEY-123');
    expect(decoded?.machines[0].machine_id).toBe('mac-1');
  });

  it('rejects a payload with a wrong field type', () => {
    const malformed = {
      ...validPayload,
      license: { ...validPayload.license, max_machines: '3' },
    };
    expect(decodeTelemetryDashboard(malformed)).toBeNull();
  });

  it('rejects a payload missing the user block', () => {
    const { user: _user, ...missingUser } = validPayload;
    expect(decodeTelemetryDashboard(missingUser)).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(decodeTelemetryDashboard('not-json')).toBeNull();
    expect(decodeTelemetryDashboard(null)).toBeNull();
  });

  it('accepts an absent global_stats block', () => {
    const { global_stats: _globalStats, ...withoutStats } = validPayload;
    const decoded = decodeTelemetryDashboard(withoutStats);
    expect(decoded).not.toBeNull();
    expect(decoded?.global_stats).toBeUndefined();
  });
});
