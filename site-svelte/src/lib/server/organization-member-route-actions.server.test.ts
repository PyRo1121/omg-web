import { APIError } from 'better-auth';
import { describe, expect, it } from 'vitest';
import type { AuthEnvironment } from './auth.server';
import type { OrganizationActionEvent } from './organization-route-actions.server';
import type { OrganizationMemberAuthGateway } from './organization-member.server';
import {
  changeOrganizationMemberRoleAction,
  removeOrganizationMemberAction,
  transferOrganizationOwnershipAction,
} from './organization-member-route-actions.server';

const identity = {
  sessionToken: 'session-token',
  user: {
    id: 'owner-user',
    email: 'owner@example.com',
    emailVerified: true,
    name: 'Owner',
    image: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
};

const TRANSFER_NOW = new Date('2026-08-28T12:00:00.000Z');

interface MemberDatabaseOptions {
  readonly actorRole?: 'owner' | 'admin' | 'member';
  readonly recentSessionAt?: number | string;
  readonly restricted?: boolean;
  readonly targetRole?: 'owner' | 'admin' | 'member';
  readonly targetUserId?: string;
}

function database(options: MemberDatabaseOptions = {}): AuthEnvironment['DB'] {
  const target = {
    id: 'member-private-id',
    role: options.targetRole ?? 'member',
    userId: options.targetUserId ?? 'member-user',
  };
  const summary = {
    billingCustomerId: 'customer-1',
    maxSeats: 5,
    name: 'Acme Engineering',
    role: options.actorRole ?? 'owner',
    slug: 'acme-engineering',
    status: options.restricted ? 'past_due' : 'active',
    tier: 'team',
    usedSeats: 2,
  };
  const db: AuthEnvironment['DB'] = {
    batch: async () => {
      const result = {
        meta: {
          changed_db: true,
          changes: 1,
          duration: 0,
          last_row_id: 0,
          rows_read: 0,
          rows_written: 1,
          size_after: 0,
        },
        results: [],
        success: true,
      };
      return [result, result];
    },
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
    prepare: (sql: string) => ({
      all: async () => ({ results: [] }),
      bind: (..._bindings: Array<unknown>) => ({
        all: async () => ({ results: [] }),
        bind: () => {
          throw new Error('bind may only be called once');
        },
        first: async () => {
          if (sql.includes('targetUser')) {
            return target;
          }
          if (sql.includes('created_at AS createdAt')) {
            return { createdAt: options.recentSessionAt ?? TRANSFER_NOW.getTime() };
          }
          if (sql.includes('COALESCE')) {
            return { organizationId: 'organization-1' };
          }
          if (sql.includes('billing_customer_id')) {
            return summary;
          }
          return null;
        },
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

function environment(options: MemberDatabaseOptions = {}) {
  const keys: string[] = [];
  const env = {
    BETTER_AUTH_SECRET: 'organization-member-test-secret',
    DB: database(options),
    GITHUB_CLIENT_ID: 'github-client',
    GITHUB_CLIENT_SECRET: 'github-secret',
    LICENSING_API: { fetch: async () => Response.json({}) },
    SVELTE_BFF_SECRET: 'private-bff-secret',
    AUTH_RATE_LIMITER: {
      limit: async ({ key }: { readonly key: string }) => {
        keys.push(key);
        return { success: true };
      },
    },
  };
  return { env, keys };
}

function request(body: string): Request {
  return new Request('https://shadow.example/dashboard/organization/members/?/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function event(
  input: Request,
  env: ReturnType<typeof environment>['env']
): OrganizationActionEvent {
  return {
    platform: { env },
    request: input,
    url: new URL('https://shadow.example/dashboard/organization/members/'),
  };
}

function gateway(
  calls: Array<{ readonly operation: string; readonly body: unknown }>
): OrganizationMemberAuthGateway {
  return {
    removeMember: async input => {
      calls.push({ operation: 'remove', body: input.body });
      return { member: { role: 'member' } };
    },
    updateMemberRole: async input => {
      calls.push({ operation: 'role', body: input.body });
      return { role: 'admin' };
    },
  };
}

const loadIdentity = async () => identity;

describe('organization member actions', () => {
  it('changes a non-owner role through a server-resolved member ID', async () => {
    const { env, keys } = environment();
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];

    await expect(
      changeOrganizationMemberRoleAction(
        event(request('email=Member%40Example.com&role=admin'), env),
        gateway(calls),
        loadIdentity
      )
    ).rejects.toMatchObject({ status: 303, location: '/dashboard/organization/members/' });

    expect(calls).toEqual([
      { operation: 'role', body: { memberId: 'member-private-id', role: 'admin' } },
    ]);
    expect(keys).toEqual(['organization:organization-1:owner-user']);
  });

  it('allows removal in a restricted workspace while keeping role growth paused', async () => {
    const { env } = environment({ restricted: true });
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];

    await expect(
      removeOrganizationMemberAction(
        event(request('email=Member%40Example.com'), env),
        gateway(calls),
        loadIdentity
      )
    ).rejects.toMatchObject({ status: 303 });

    expect(calls).toEqual([
      { operation: 'remove', body: { memberIdOrEmail: 'member@example.com' } },
    ]);
  });

  it('protects the Owner and the actor from self-lockout', async () => {
    const ownerEnvironment = environment({ targetRole: 'owner' });
    const ownerCalls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const ownerResult = await removeOrganizationMemberAction(
      event(request('email=owner%40example.com'), ownerEnvironment.env),
      gateway(ownerCalls),
      loadIdentity
    );
    expect(ownerResult.status).toBe(403);
    expect(ownerResult.data.message).toBe('The organization Owner cannot be changed here.');
    expect(ownerCalls).toEqual([]);

    const selfEnvironment = environment({ targetRole: 'admin', targetUserId: 'owner-user' });
    const selfCalls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const selfResult = await changeOrganizationMemberRoleAction(
      event(request('email=owner%40example.com&role=member'), selfEnvironment.env),
      gateway(selfCalls),
      loadIdentity
    );
    expect(selfResult.status).toBe(403);
    expect(selfResult.data.message).toBe('Your own organization access cannot be changed here.');
    expect(selfCalls).toEqual([]);
  });

  it('transfers ownership only for an Owner with recent authentication and both confirmations', async () => {
    const { env, keys } = environment();

    await expect(
      transferOrganizationOwnershipAction(
        event(request('email=Member%40Example.com&confirmation=TRANSFER+OWNERSHIP'), env),
        loadIdentity,
        TRANSFER_NOW
      )
    ).rejects.toMatchObject({ status: 303, location: '/dashboard/organization/members/' });
    expect(keys).toEqual(['organization:organization-1:owner-user:ownership']);
  });

  it('fails closed for stale authentication, non-Owners, and a malformed confirmation', async () => {
    const stale = environment({
      recentSessionAt: TRANSFER_NOW.getTime() - 15 * 60 * 1000 - 1,
    });
    const staleResult = await transferOrganizationOwnershipAction(
      event(request('email=Member%40Example.com&confirmation=TRANSFER+OWNERSHIP'), stale.env),
      loadIdentity,
      TRANSFER_NOW
    );
    expect(staleResult.status).toBe(403);
    expect(staleResult.data.message).toBe(
      'Sign in again before transferring organization ownership.'
    );

    const admin = environment({ actorRole: 'admin' });
    const adminResult = await transferOrganizationOwnershipAction(
      event(request('email=Member%40Example.com&confirmation=TRANSFER+OWNERSHIP'), admin.env),
      loadIdentity,
      TRANSFER_NOW
    );
    expect(adminResult.status).toBe(403);
    expect(adminResult.data.message).toBe('Only the organization Owner can transfer ownership.');

    const malformed = await transferOrganizationOwnershipAction(
      {
        platform: undefined,
        request: request('email=Member%40Example.com&confirmation=TRANSFER'),
        url: new URL('https://shadow.example/dashboard/organization/members/'),
      },
      async () => {
        throw new Error('identity lookup should not run');
      },
      TRANSFER_NOW
    );
    expect(malformed.status).toBe(400);
  });

  it('bounds forms before identity or storage work and maps Better Auth authorization failures', async () => {
    const oversized = await removeOrganizationMemberAction(
      {
        platform: undefined,
        request: request(`email=${'x'.repeat(9000)}`),
        url: new URL('https://shadow.example/dashboard/organization/members/'),
      },
      undefined,
      async () => {
        throw new Error('identity lookup should not run');
      }
    );
    expect(oversized.status).toBe(413);

    const { env } = environment();
    const forbiddenGateway = {
      ...gateway([]),
      updateMemberRole: async () => {
        throw APIError.from('FORBIDDEN', {
          code: 'YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER',
          message: 'private member details',
        });
      },
    };
    const forbidden = await changeOrganizationMemberRoleAction(
      event(request('email=Member%40Example.com&role=admin'), env),
      forbiddenGateway,
      loadIdentity
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.data.message).toBe(
      'You do not have permission to change this organization member.'
    );
    expect(JSON.stringify(forbidden.data)).not.toContain('private member details');
  });
});
