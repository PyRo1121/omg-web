import { Effect } from 'effect';
import { APIError } from 'better-auth';
import { describe, expect, it } from 'vitest';
import type { AuthEnvironment } from './auth.server';
import {
  acceptOrganizationInvitationAction,
  inviteOrganizationMemberAction,
  rejectOrganizationInvitationAction,
  resendOrganizationInvitationAction,
  revokeOrganizationInvitationAction,
  type OrganizationActionEvent,
  type OrganizationInvitationAcceptanceEvent,
} from './organization-route-actions.server';
import { OrganizationInvitationDeliveryFailed } from './organization-invitation-email.server';
import {
  recordOrganizationAudit,
  type OrganizationInvitationAuthGateway,
} from './organization-invitation.server';
import { createOrganizationInvitationReference } from './organization-invitation-token.server';

const identity = {
  sessionToken: 'session-token',
  user: {
    id: 'user-1',
    email: 'owner@example.com',
    emailVerified: true,
    name: 'Owner',
    image: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
};

interface DatabaseOptions {
  readonly restricted?: boolean;
  readonly pending?: boolean;
  readonly unavailable?: boolean;
}

function database(options: DatabaseOptions = {}): AuthEnvironment['DB'] {
  const summary = {
    billingCustomerId: 'customer-1',
    maxSeats: 5,
    name: 'Acme Engineering',
    role: 'owner',
    slug: 'acme-engineering',
    status: options.restricted ? 'past_due' : 'active',
    tier: 'team',
    usedSeats: 1,
  };
  const pending =
    options.pending === false ? null : { id: 'invitation-private-id', role: 'member' };
  const db: AuthEnvironment['DB'] = {
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
    prepare: (sql: string) => ({
      all: async () => ({ results: [] }),
      bind: (..._bindings: Array<unknown>) => ({
        all: async () => {
          if (sql.includes('billing_customer_id')) {
            return { results: [] };
          }
          if (sql.includes('auth_invitation')) {
            return {
              results:
                pending === null
                  ? []
                  : [
                      {
                        email: 'employee@example.com',
                        expiresAt: '2027-01-02T03:04:05.000Z',
                        id: pending.id,
                        role: pending.role,
                      },
                    ],
            };
          }
          return { results: [] };
        },
        bind: () => {
          throw new Error('bind may only be called once');
        },
        first: async () => {
          if (options.unavailable) {
            throw new Error('database unavailable');
          }
          if (sql.includes('COALESCE')) {
            return { organizationId: 'organization-1' };
          }
          if (sql.includes('lower(invitation.email)')) {
            return pending;
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

function environment(options: DatabaseOptions = {}) {
  const keys: string[] = [];
  const env = {
    BETTER_AUTH_SECRET: 'organization-invitation-test-secret',
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
  return new Request('https://shadow.example/dashboard/organization/members/?/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': '192.0.2.20',
    },
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
): OrganizationInvitationAuthGateway {
  return {
    acceptInvitation: async input => {
      calls.push({ operation: 'accept', body: input.body });
      return { invitation: { status: 'accepted' }, member: { role: 'member' } };
    },
    cancelInvitation: async input => {
      calls.push({ operation: 'cancel', body: input.body });
      return { status: 'canceled' };
    },
    rejectInvitation: async input => {
      calls.push({ operation: 'reject', body: input.body });
      return { invitation: { status: 'rejected' }, member: null };
    },
    createInvitation: async input => {
      calls.push({ operation: 'create', body: input.body });
      return { status: 'pending' };
    },
  };
}

const loadIdentity = async () => identity;

describe('organization invitation actions', () => {
  it('bounds and parses the invite form before authentication or storage work', async () => {
    const oversized = await inviteOrganizationMemberAction(
      {
        platform: undefined,
        request: request(`email=${'x'.repeat(9000)}&role=member`),
        url: new URL('https://shadow.example/dashboard/organization/members/'),
      },
      undefined,
      async () => {
        throw new Error('identity lookup should not run');
      }
    );

    expect('status' in oversized).toBe(true);
    if ('status' in oversized) {
      expect(oversized.status).toBe(413);
    }
  });

  it('normalizes the employee email, enforces the active organization, and calls Better Auth once', async () => {
    const { env, keys } = environment();
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];

    await expect(
      inviteOrganizationMemberAction(
        event(request('email=Employee%40Example.com&role=admin'), env),
        gateway(calls),
        loadIdentity
      )
    ).rejects.toMatchObject({
      status: 303,
      location: '/dashboard/organization/members/',
    });

    expect(calls).toEqual([
      { operation: 'create', body: { email: 'employee@example.com', role: 'admin' } },
    ]);
    expect(keys).toEqual(['organization:organization-1:user-1']);
  });

  it('maps Better Auth duplicate and delivery failures without leaking its response body', async () => {
    const { env } = environment();
    const duplicateCalls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const duplicateGateway = {
      ...gateway(duplicateCalls),
      createInvitation: async () => {
        throw APIError.from('BAD_REQUEST', {
          code: 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION',
          message: 'private database details',
        });
      },
    };

    const duplicate = await inviteOrganizationMemberAction(
      event(request('email=employee%40example.com&role=member'), env),
      duplicateGateway,
      loadIdentity
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.data.message).toBe(
      'That employee is already a member or has a pending invitation.'
    );
    expect(JSON.stringify(duplicate.data)).not.toContain('private database details');

    const deliveryCalls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const deliveryGateway = {
      ...gateway(deliveryCalls),
      createInvitation: async () => {
        throw new OrganizationInvitationDeliveryFailed();
      },
    };
    const delivery = await inviteOrganizationMemberAction(
      event(request('email=employee%40example.com&role=member'), env),
      deliveryGateway,
      loadIdentity
    );
    expect(delivery.status).toBe(503);
    expect(delivery.data.message).toBe(
      'The invitation was saved, but its email could not be sent. Retry it shortly.'
    );
  });

  it('fails closed for restricted growth and does not call Better Auth', async () => {
    const { env } = environment({ restricted: true });
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];

    const result = await inviteOrganizationMemberAction(
      event(request('email=employee%40example.com&role=member'), env),
      gateway(calls),
      loadIdentity
    );

    expect(result.status).toBe(403);
    expect(result.data.message).toBe(
      'Membership changes are paused while the subscription is resolved.'
    );
    expect(calls).toEqual([]);
  });

  it('resends and revokes by server-resolved email without putting invitation IDs in forms', async () => {
    const { env } = environment();
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const auth = gateway(calls);

    await expect(
      resendOrganizationInvitationAction(
        event(request('email=Employee%40Example.com'), env),
        auth,
        loadIdentity
      )
    ).rejects.toMatchObject({ status: 303 });
    await expect(
      revokeOrganizationInvitationAction(
        event(request('email=Employee%40Example.com'), env),
        auth,
        loadIdentity
      )
    ).rejects.toMatchObject({ status: 303 });

    expect(calls).toEqual([
      {
        operation: 'create',
        body: { email: 'employee@example.com', resend: true, role: 'member' },
      },
      { operation: 'cancel', body: { invitationId: 'invitation-private-id' } },
    ]);
  });

  it('records a bounded lifecycle audit event without invitation identifiers or tokens', async () => {
    let bindings: ReadonlyArray<unknown> = [];
    const db: AuthEnvironment['DB'] = {
      batch: async () => [],
      dump: async () => new ArrayBuffer(0),
      exec: async () => ({ count: 0, duration: 0 }),
      prepare: () => ({
        all: async () => ({ results: [] }),
        bind: (...values: Array<unknown>) => ({
          all: async () => ({ results: [] }),
          bind: () => {
            throw new Error('bind may only be called once');
          },
          first: async () => null,
          raw: async () => [],
          run: async () => {
            bindings = values;
            return { success: true };
          },
        }),
        first: async () => null,
        raw: async () => [],
        run: async () => ({ success: true }),
      }),
      withSession: () => db,
    };

    await recordOrganizationAudit(
      db,
      new Request('https://shadow.example/dashboard/', {
        headers: { 'CF-Connecting-IP': '192.0.2.30', 'User-Agent': 'test-agent' },
      }),
      'organization.invitation.created',
      'member'
    );

    expect(bindings[1]).toBe('organization.invitation.created');
    expect(bindings[2]).toBe('192.0.2.30');
    expect(bindings[4]).toBe('{"role":"member"}');
    expect(JSON.stringify(bindings)).not.toContain('invitation-private-id');
    expect(JSON.stringify(bindings)).not.toContain('token=');
  });

  it('rejects an opaque reference through a server-only cookie and clears it after success', async () => {
    const { env } = environment();
    const reference = await Effect.runPromise(
      createOrganizationInvitationReference(
        'invitation-private-id',
        new Date('2027-01-02T03:04:05.000Z'),
        env.BETTER_AUTH_SECRET
      )
    );
    let deleted = false;
    const cookies = {
      delete: (name: string) => {
        expect(name).toBe('omg-organization-invitation');
        deleted = true;
      },
      get: (name: string) => (name === 'omg-organization-invitation' ? reference : undefined),
    };
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const acceptanceEvent: OrganizationInvitationAcceptanceEvent = {
      ...event(request(''), env),
      cookies,
    };

    await expect(
      rejectOrganizationInvitationAction(acceptanceEvent, gateway(calls), loadIdentity)
    ).rejects.toMatchObject({ status: 303, location: '/dashboard/' });
    expect(calls).toEqual([
      { operation: 'reject', body: { invitationId: 'invitation-private-id' } },
    ]);
    expect(deleted).toBe(true);
  });

  it('accepts an opaque reference through a server-only cookie and clears it after success', async () => {
    const { env } = environment();
    const reference = await Effect.runPromise(
      createOrganizationInvitationReference(
        'invitation-private-id',
        new Date('2027-01-02T03:04:05.000Z'),
        env.BETTER_AUTH_SECRET
      )
    );
    let deleted = false;
    const cookies = {
      delete: (name: string) => {
        expect(name).toBe('omg-organization-invitation');
        deleted = true;
      },
      get: (name: string) => (name === 'omg-organization-invitation' ? reference : undefined),
    };
    const calls: Array<{ readonly operation: string; readonly body: unknown }> = [];
    const acceptanceEvent: OrganizationInvitationAcceptanceEvent = {
      ...event(request(''), env),
      cookies,
    };

    await expect(
      acceptOrganizationInvitationAction(acceptanceEvent, gateway(calls), loadIdentity)
    ).rejects.toMatchObject({ status: 303, location: '/dashboard/organization/' });
    expect(calls).toEqual([
      { operation: 'accept', body: { invitationId: 'invitation-private-id' } },
    ]);
    expect(deleted).toBe(true);
  });
});
