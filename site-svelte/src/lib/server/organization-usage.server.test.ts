import { describe, expect, it } from 'vitest';
import * as Schema from 'effect/Schema';
import type { OrganizationUsageResponse } from '../../../../site/shared/organization-usage';
import type { AuthEnvironment } from './auth.server';
import {
  loadOrganizationUsageState,
  OrganizationUsageRequestSchema,
} from './organization-usage.server';

const IDENTITY = {
  id: 'private-user-id',
  email: 'owner@example.com',
  emailVerified: true,
  sessionToken: 'private-session-token',
};

const USAGE: OrganizationUsageResponse = {
  organization: { name: 'Acme Engineering', role: 'owner', status: 'active', tier: 'team' },
  seats: { used: 2, limit: 5 },
  windowDays: 30,
  members: [
    {
      email: 'owner@example.com',
      name: 'Owner',
      role: 'owner',
      attributedMachines: 1,
      usage: { commands: 10, packagesInstalled: 2, runtimeSwitches: 1, timeSavedMs: 500 },
    },
  ],
  hasMoreMembers: false,
  unattributed: {
    machines: 1,
    usage: { commands: 3, packagesInstalled: 0, runtimeSwitches: 1, timeSavedMs: 100 },
  },
  fleet: {
    activeMachines: 2,
    seenWithinSevenDays: 1,
    notSeenWithinSevenDays: 1,
    versions: [
      { version: '1.2.3', machines: 1 },
      { version: null, machines: 1 },
    ],
    hasMoreVersions: false,
  },
};

function database(hasOrganization = true): AuthEnvironment['DB'] {
  const db: AuthEnvironment['DB'] = {
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
    prepare: () => ({
      all: async () => ({ results: [] }),
      bind: () => ({
        all: async () => ({ results: [] }),
        bind: () => {
          throw new Error('bind may only be called once');
        },
        first: async () =>
          hasOrganization
            ? { organizationId: 'private-organization-id' }
            : { organizationId: null },
        raw: async () => [],
        run: async () => ({ success: true }),
      }),
      first: async () => null,
      raw: async () => [],
      run: async () => ({ success: true }),
    }),
    withSession: () => db,
  };
  return db;
}

function environment(
  fetch: (request: Request) => Promise<Response>,
  hasOrganization = true
): Pick<AuthEnvironment, 'DB' | 'LICENSING_API' | 'SVELTE_BFF_SECRET'> {
  return {
    DB: database(hasOrganization),
    LICENSING_API: { fetch },
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

describe('organization usage server boundary', () => {
  it('sends only private identity references and returns the parsed safe projection', async () => {
    const state = await loadOrganizationUsageState(
      IDENTITY,
      environment(async request => {
        expect(request.url).toBe('https://omg-saas.internal/api/internal/organization-usage');
        expect(request.headers.get('X-Admin-Secret')).toBe('private-bff-secret');
        expect(request.headers.get('X-Internal-Call')).toBe('service-binding');
        const input = Schema.decodeUnknownSync(OrganizationUsageRequestSchema)(
          await request.json()
        );
        expect(input).toEqual({
          organizationId: 'private-organization-id',
          userId: 'private-user-id',
        });
        return Response.json(USAGE);
      })
    );

    expect(state).toEqual({ status: 'available', usage: USAGE });
  });

  it('does not call the Worker without an active organization', async () => {
    let called = false;
    const state = await loadOrganizationUsageState(
      IDENTITY,
      environment(async () => {
        called = true;
        return Response.json(USAGE);
      }, false)
    );

    expect(state).toEqual({ status: 'no-organization' });
    expect(called).toBe(false);
  });

  it('fails closed for unverified identities and malformed Worker projections', async () => {
    const unverified = await loadOrganizationUsageState(
      { ...IDENTITY, emailVerified: false },
      environment(async () => {
        throw new Error('Worker must not be called');
      })
    );
    expect(unverified).toEqual({ status: 'verification-required' });

    const malformed = await loadOrganizationUsageState(
      IDENTITY,
      environment(async () => Response.json({ organization: { name: 'leaky' } }))
    );
    expect(malformed).toEqual({ status: 'unavailable' });
  });
});
