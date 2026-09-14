import { describe, expect, it } from 'vitest';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import { loadAccountMachinesState } from './account-machines.server';
import { siteSessionResponse } from '../../../tests/test-utils';

const identity = {
  id: 'user-id',
  email: 'ada@example.com',
  name: 'Ada',
  emailVerified: true,
};

interface MachinePayload {
  readonly license: { readonly max_machines: number; readonly license_key?: string };
  readonly machines: ReadonlyArray<{
    readonly id: string;
    readonly machine_id: string;
    readonly hostname: string | null;
    readonly os: string | null;
    readonly arch: string | null;
    readonly omg_version: string | null;
    readonly first_seen_at: string;
    readonly last_seen_at: string;
    readonly is_active: number;
  }>;
}

class MachineServiceStub {
  readonly requests: Array<Request> = [];
  constructor(private readonly payload: MachinePayload) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push(request.clone());
    return request.url.endsWith('/api/internal/site-session')
      ? siteSessionResponse({
          token: 'private-token',
          expiresAt: '2026-08-28T15:00:00Z',
        })
      : Response.json(this.payload);
  }
}

function environment(service: MachineServiceStub): LicensingSummaryEnvironment {
  return {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ role: 'user' }) }) }) },
    SVELTE_BFF_SECRET: 'private-secret',
    LICENSING_API: service,
  };
}

const machine: MachinePayload['machines'][number] = {
  id: 'database-machine-id',
  machine_id: 'device-fingerprint',
  hostname: 'workstation',
  os: 'linux',
  arch: 'x86_64',
  omg_version: '1.2.3',
  first_seen_at: '2026-08-01T00:00:00.000Z',
  last_seen_at: '2026-08-28T12:00:00.000Z',
  is_active: 1,
};

const payload: MachinePayload = {
  license: { max_machines: 5, license_key: 'raw-license-key' },
  machines: [machine],
};

describe('account machines service', () => {
  it('projects descriptive machine metadata without persistent identifiers', async () => {
    const service = new MachineServiceStub(payload);

    const result = await loadAccountMachinesState(identity, environment(service));

    expect(result).toEqual({
      status: 'available',
      machines: {
        active: 1,
        allowance: 5,
        machines: [
          {
            hostname: 'workstation',
            operatingSystem: 'linux',
            architecture: 'x86_64',
            version: '1.2.3',
            firstSeenAt: '2026-08-01T00:00:00.000Z',
            lastSeenAt: '2026-08-28T12:00:00.000Z',
          },
        ],
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('raw-license-key');
    expect(serialized).not.toContain('database-machine-id');
    expect(serialized).not.toContain('device-fingerprint');
    expect(service.requests[1]?.headers.get('Authorization')).toBe('Bearer private-token');
  });

  it('maps inactive and malformed machine rows to unavailable', async () => {
    const service = new MachineServiceStub({
      ...payload,
      machines: [{ ...machine, is_active: 0 }],
    });

    const state = await loadAccountMachinesState(identity, environment(service));

    expect(state).toEqual({ status: 'unavailable' });
  });

  it('requires verified email before private access', async () => {
    const service = new MachineServiceStub(payload);

    const state = await loadAccountMachinesState(
      { ...identity, emailVerified: false },
      environment(service)
    );

    expect(state).toEqual({ status: 'verification-required' });
    expect(service.requests).toHaveLength(0);
  });
});
