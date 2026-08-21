import { describe, expect, it } from 'vitest';
import { parseTelemetryMessage } from './telemetry-message';

const GEO = {
  country_code: 'US',
  country: 'United States',
  region: 'CA',
  city: 'San Francisco',
  latitude: 37.77,
  longitude: -122.42,
};

describe('parseTelemetryMessage', () => {
  it('decodes a command event', () => {
    const parsed = parseTelemetryMessage({
      type: 'command_event',
      timestamp: '2026-08-21T00:00:00Z',
      data: {
        id: 'event-1',
        license_key: 'license',
        license_tier: 'pro',
        user_email: 'user@example.com',
        command: 'install',
        package_name: 'effect',
        duration_ms: 42,
        status: 'success',
        platform: 'linux',
        version: '1.0.0',
        hostname: 'workstation',
        machine_id: 'machine-1',
        geo: GEO,
        timestamp: '2026-08-21T00:00:00Z',
      },
    });

    expect(parsed?.type).toBe('command_event');
    if (parsed?.type === 'command_event') {
      expect(parsed.data.command).toBe('install');
      expect(parsed.data.geo?.country_code).toBe('US');
    }
  });

  it('decodes session and health discriminants', () => {
    const session = parseTelemetryMessage({
      type: 'session_start',
      timestamp: '2026-08-21T00:00:00Z',
      data: {
        session_id: 'session-1',
        license_key: 'license',
        license_tier: 'team',
        machine_id: 'machine-1',
        platform: 'linux',
        version: '1.0.0',
        started_at: '2026-08-21T00:00:00Z',
        last_activity_at: '2026-08-21T00:01:00Z',
        command_count: 2,
        is_active: true,
      },
    });
    const health = parseTelemetryMessage({
      type: 'health_update',
      timestamp: '2026-08-21T00:00:00Z',
      data: {
        overall_score: 90,
        engagement_score: 80,
        adoption_score: 70,
        satisfaction_score: 95,
        previous_score: 85,
        trend: 'up',
        updated_at: '2026-08-21T00:00:00Z',
      },
    });

    expect(session?.type).toBe('session_start');
    expect(health?.type).toBe('health_update');
  });

  it('rejects malformed nested provider data', () => {
    expect(
      parseTelemetryMessage({
        type: 'command_event',
        timestamp: '2026-08-21T00:00:00Z',
        data: {
          id: 'event-1',
          license_key: 'license',
          license_tier: 'unknown',
          command: 'install',
          duration_ms: Number.NaN,
          status: 'success',
          platform: 'linux',
          version: '1.0.0',
          machine_id: 'machine-1',
          timestamp: '2026-08-21T00:00:00Z',
        },
      })
    ).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(parseTelemetryMessage({ type: 'future_event', data: {}, timestamp: 'now' })).toBeNull();
  });
});
