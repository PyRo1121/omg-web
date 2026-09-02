import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  loadAdminOrganizationSupport,
  parseAdminOrganizationQuery,
  parseAdminOrganizationSupportQuery,
} from './admin-organizations.server';
import {
  AdminOverviewForbidden,
  type LicensingSummaryEnvironment,
} from './licensing-service.server';
import { siteSessionResponse } from './test-utils';

const identity = {
  id: 'better-auth-operator',
  email: 'operator@example.com',
  name: 'Operator',
  emailVerified: true,
};

type SupportPayloadFixture = ReturnType<typeof supportPayload>;

class OrganizationServiceStub {
  readonly requests: Array<{ readonly authorization: string | null; readonly url: URL }> = [];

  constructor(private readonly supportResponse: SupportPayloadFixture) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push({
      authorization: request.headers.get('Authorization'),
      url: new URL(request.url),
    });
    if (new URL(request.url).pathname === '/api/internal/site-session') {
      return siteSessionResponse({ customerId: 'private-operator-customer' });
    }
    return Response.json(this.supportResponse);
  }
}

function environment(
  service: OrganizationServiceStub,
  role: 'user' | 'admin' = 'admin'
): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: sql => ({
        bind: (...bindings) => ({
          first: async () => {
            expect(sql).toBe('SELECT role FROM auth_user WHERE id = ?');
            expect(bindings).toEqual([identity.id]);
            return { role };
          },
        }),
      }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

function supportPayload() {
  return {
    organization: {
      name: 'Acme Engineering',
      slug: 'acme-engineering',
      organizationId: 'private-organization-id',
    },
    entitlement: { tier: 'team', licenseStatus: 'active', access: 'active' },
    seats: { used: 2, limit: 5 },
    members: [
      {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'owner',
        joinedAt: '2026-08-01T00:00:00.000Z',
        memberId: 'private-member-id',
      },
    ],
    hasMoreMembers: false,
    invitations: [
      {
        email: 'grace@example.com',
        role: 'member',
        status: 'pending',
        expiresAt: '2026-09-01T00:00:00.000Z',
        invitationId: 'private-invitation-id',
      },
    ],
    hasMoreInvitations: false,
    usage: {
      windowDays: 30,
      activeDays: 6,
      totals: {
        commands: 120,
        packagesInstalled: 8,
        packagesSearched: 14,
        runtimeSwitches: 3,
        sbomsGenerated: 2,
        vulnerabilitiesFound: 4,
        timeSavedMs: 900000,
      },
    },
    fleet: {
      activeMachines: 3,
      seenWithinSevenDays: 2,
      notSeenWithinSevenDays: 1,
      versions: [{ version: '1.4.0', machines: 3, licenseId: 'private-license-id' }],
      hasMoreVersions: false,
    },
    audit: {
      events: [
        {
          action: 'organization.invitation.created',
          role: 'member',
          occurredAt: '2026-08-29T12:00:00.000Z',
          auditId: 'private-audit-id',
        },
      ],
      hasMoreEvents: false,
    },
  };
}

describe('admin organization query boundary', () => {
  it('accepts bounded search and pagination', () => {
    expect(
      parseAdminOrganizationQuery(new URL('https://example.test/admin/organizations/'))
    ).toEqual({ page: 1, search: '' });
    expect(
      parseAdminOrganizationQuery(
        new URL('https://example.test/admin/organizations/?page=40&q=acme')
      )
    ).toEqual({ page: 40, search: 'acme' });
  });

  it.each(['?page=0', '?page=41', '?page=1.5', '?page=1&page=2', `?q=${'x'.repeat(101)}`])(
    'rejects %s',
    query => {
      expect(
        parseAdminOrganizationQuery(new URL(`https://example.test/admin/organizations/${query}`))
      ).toBeNull();
    }
  );
});

describe('admin organization support boundary', () => {
  it('accepts one browser-safe slug and rejects raw or ambiguous selections', () => {
    expect(
      parseAdminOrganizationSupportQuery(
        new URL('https://example.test/admin/organizations/support/?slug=acme-engineering')
      )
    ).toBe('acme-engineering');
    expect(
      parseAdminOrganizationSupportQuery(
        new URL('https://example.test/admin/organizations/support/?organizationId=private-id')
      )
    ).toBeNull();
    expect(
      parseAdminOrganizationSupportQuery(
        new URL('https://example.test/admin/organizations/support/?slug=acme&slug=other')
      )
    ).toBeNull();
    expect(
      parseAdminOrganizationSupportQuery(
        new URL('https://example.test/admin/organizations/support/?slug=Not_A_Slug')
      )
    ).toBeNull();
  });

  it('loads support through an admin session and strips unknown private fields', async () => {
    const service = new OrganizationServiceStub(supportPayload());
    const support = await Effect.runPromise(
      loadAdminOrganizationSupport(identity, environment(service), 'acme-engineering')
    );

    expect(support.organization).toEqual({ name: 'Acme Engineering', slug: 'acme-engineering' });
    expect(support.members[0]).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'owner',
      joinedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(service.requests[1]).toMatchObject({ authorization: 'Bearer server-only-token' });
    expect(service.requests[1]?.url.pathname).toBe('/api/admin/organizations/support');
    expect(service.requests[1]?.url.search).toBe('?slug=acme-engineering');
    expect(JSON.stringify(support)).not.toContain('private-');
  });

  it('denies non-admin identities before requesting organization support', async () => {
    const service = new OrganizationServiceStub(supportPayload());
    const exit = await Effect.runPromiseExit(
      loadAdminOrganizationSupport(identity, environment(service, 'user'), 'acme-engineering')
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const failure = Exit.isFailure(exit)
      ? Option.getOrNull(Cause.findErrorOption(exit.cause))
      : null;
    expect(failure).toBeInstanceOf(AdminOverviewForbidden);
    expect(service.requests).toHaveLength(0);
  });
});
