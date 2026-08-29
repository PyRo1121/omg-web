import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import type { OrganizationAuditResponse } from '../../../../site/shared/organization-audit';
import type { AuthEnvironment } from './auth.server';
import {
  loadOrganizationAuditState,
  OrganizationAuditQueryInvalid,
  OrganizationAuditRequestSchema,
  readOrganizationAuditQuery,
} from './organization-audit.server';

const IDENTITY = {
  id: 'private-user-id',
  email: 'owner@example.com',
  emailVerified: true,
  sessionToken: 'private-session-token',
};
const AUDIT: OrganizationAuditResponse = {
  organization: { name: 'Acme Engineering', role: 'owner', status: 'active', tier: 'team' },
  filter: 'members',
  page: 2,
  pageSize: 25,
  hasMore: false,
  events: [
    {
      action: 'organization.member.role_changed',
      role: 'admin',
      occurredAt: '2026-08-29T12:00:00.000Z',
    },
  ],
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

describe('organization audit server boundary', () => {
  it('decodes default and bounded filter queries', () => {
    expect(readOrganizationAuditQuery(new URLSearchParams())).toEqual({
      filter: 'all',
      page: 1,
    });
    expect(readOrganizationAuditQuery(new URLSearchParams('filter=members&page=40'))).toEqual({
      filter: 'members',
      page: 40,
    });
    for (const query of ['filter=unknown', 'page=0', 'page=41', 'page=1.5', 'page=1&page=2']) {
      expect(() => readOrganizationAuditQuery(new URLSearchParams(query))).toThrow(
        OrganizationAuditQueryInvalid
      );
    }
  });

  it('sends private references and the bounded query to the Worker', async () => {
    const state = await loadOrganizationAuditState(
      IDENTITY,
      { filter: 'members', page: 2 },
      environment(async request => {
        expect(request.url).toBe('https://omg-saas.internal/api/internal/organization-audit');
        expect(request.headers.get('X-Admin-Secret')).toBe('private-bff-secret');
        expect(request.headers.get('X-Internal-Call')).toBe('service-binding');
        const input = Schema.decodeUnknownSync(OrganizationAuditRequestSchema)(
          await request.json()
        );
        expect(input).toEqual({
          organizationId: 'private-organization-id',
          userId: 'private-user-id',
          filter: 'members',
          page: 2,
        });
        return Response.json(AUDIT);
      })
    );

    expect(state).toEqual({ status: 'available', audit: AUDIT });
  });

  it('fails closed for missing organizations, unverified identities, and malformed responses', async () => {
    let called = false;
    const missing = await loadOrganizationAuditState(
      IDENTITY,
      { filter: 'all', page: 1 },
      environment(async () => {
        called = true;
        return Response.json(AUDIT);
      }, false)
    );
    const unverified = await loadOrganizationAuditState(
      { ...IDENTITY, emailVerified: false },
      { filter: 'all', page: 1 },
      environment(async () => {
        throw new Error('Worker must not be called');
      })
    );
    const malformed = await loadOrganizationAuditState(
      IDENTITY,
      { filter: 'all', page: 1 },
      environment(async () => Response.json({ organization: { name: 'leaky' } }))
    );

    expect(missing).toEqual({ status: 'no-organization' });
    expect(called).toBe(false);
    expect(unverified).toEqual({ status: 'verification-required' });
    expect(malformed).toEqual({ status: 'unavailable' });
  });
});
