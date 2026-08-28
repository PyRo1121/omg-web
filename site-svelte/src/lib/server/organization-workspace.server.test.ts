import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  OrganizationBootstrapConflict,
  OrganizationBootstrapForbidden,
  OrganizationBootstrapInvalid,
  OrganizationMembershipLimitUnavailable,
  bootstrapOrganization,
  loadOrganizationMembershipLimit,
  loadOrganizationMembersState,
  resolveOrganizationMembersState,
  loadOrganizationWorkspaceState,
  readOrganizationBootstrapForm,
  resolveOrganizationWorkspaceState,
} from './organization-workspace.server';

type OrganizationDatabase = Parameters<typeof bootstrapOrganization>[1];
type OrganizationStatement = ReturnType<OrganizationDatabase['prepare']>;

const VERIFIED_IDENTITY = {
  email: 'owner@example.com',
  emailVerified: true,
  id: 'private-user-id',
  sessionToken: 'private-session-token',
};

describe('resolveOrganizationWorkspaceState', () => {
  it('requires verification without inspecting organization rows', () => {
    const state = resolveOrganizationWorkspaceState(
      { ...VERIFIED_IDENTITY, emailVerified: false },
      { entitlementRows: 'not inspected', membershipRows: 'not inspected' }
    );

    expect(state).toEqual({ status: 'verification-required' });
  });

  it('offers bootstrap only for an active paid team entitlement', () => {
    const state = resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
      membershipRows: [],
      entitlementRows: [
        {
          customerId: 'private-customer-id',
          maxSeats: 12,
          status: 'active',
          tier: 'team',
        },
      ],
    });

    expect(state).toEqual({ status: 'eligible', tier: 'team', maxSeats: 12 });
    expect(JSON.stringify(state)).not.toContain('private-customer-id');
  });

  it('keeps individual plans useful without showing organization controls', () => {
    const state = resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
      membershipRows: [],
      entitlementRows: [
        {
          customerId: 'private-customer-id',
          maxSeats: null,
          status: 'active',
          tier: 'pro',
        },
      ],
    });

    expect(state).toEqual({ status: 'individual', tier: 'pro' });
  });

  it('returns a browser-safe active organization projection', () => {
    const state = resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
      membershipRows: [
        {
          billingCustomerId: 'private-customer-id',
          maxSeats: 20,
          name: 'Acme Engineering',
          role: 'admin',
          slug: 'acme-engineering',
          status: 'active',
          tier: 'enterprise',
          usedSeats: 7,
        },
      ],
      entitlementRows: [],
    });

    expect(state).toEqual({
      status: 'active',
      organization: {
        maxSeats: 20,
        name: 'Acme Engineering',
        role: 'admin',
        slug: 'acme-engineering',
        tier: 'enterprise',
        usedSeats: 7,
      },
    });
    expect(JSON.stringify(state)).not.toContain('private-customer-id');
  });

  it('keeps an existing organization readable after entitlement loss', () => {
    const state = resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
      membershipRows: [
        {
          billingCustomerId: 'private-customer-id',
          maxSeats: 5,
          name: 'Acme Engineering',
          role: 'owner',
          slug: 'acme-engineering',
          status: 'past_due',
          tier: 'team',
          usedSeats: 4,
        },
      ],
      entitlementRows: [],
    });

    expect(state).toEqual({
      status: 'restricted',
      organization: {
        maxSeats: 5,
        name: 'Acme Engineering',
        role: 'owner',
        slug: 'acme-engineering',
        tier: 'team',
        usedSeats: 4,
      },
    });
  });

  it('keeps the organization visible when its license row is gone', () => {
    const state = resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
      membershipRows: [
        {
          billingCustomerId: 'private-customer-id',
          maxSeats: null,
          name: 'Acme Engineering',
          role: 'member',
          slug: 'acme-engineering',
          status: null,
          tier: null,
          usedSeats: 2,
        },
      ],
      entitlementRows: [],
    });

    expect(state).toEqual({
      status: 'restricted',
      organization: {
        maxSeats: null,
        name: 'Acme Engineering',
        role: 'member',
        slug: 'acme-engineering',
        tier: null,
        usedSeats: 2,
      },
    });
  });

  it('fails closed on duplicate or malformed boundary rows', () => {
    expect(
      resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
        membershipRows: [],
        entitlementRows: [{ tier: 'team' }, { tier: 'team' }],
      })
    ).toEqual({ status: 'unavailable' });
    expect(
      resolveOrganizationWorkspaceState(VERIFIED_IDENTITY, {
        membershipRows: [{ role: 'super-admin' }],
        entitlementRows: [],
      })
    ).toEqual({ status: 'unavailable' });
  });
});

describe('resolveOrganizationMembersState', () => {
  const organization = {
    maxSeats: 12,
    name: 'Acme Engineering',
    role: 'owner' as const,
    slug: 'acme-engineering',
    tier: 'team' as const,
    usedSeats: 2,
  };

  it('projects members and invitations without storage identifiers', () => {
    const state = resolveOrganizationMembersState(
      {
        membership: {
          billingCustomerId: 'private-customer-id',
          maxSeats: 12,
          name: 'Acme Engineering',
          role: 'owner',
          slug: 'acme-engineering',
          status: 'active',
          tier: 'team',
          usedSeats: 2,
        },
        memberRows: [
          {
            email: 'owner@example.com',
            id: 'private-member-id',
            joinedAt: '2026-08-28T00:00:00.000Z',
            name: 'Owner',
            role: 'owner',
            userId: 'private-user-id',
          },
          {
            email: 'member@example.com',
            id: 'private-member-id-2',
            joinedAt: '2026-08-29T00:00:00.000Z',
            name: 'Member',
            role: 'member',
            userId: 'private-user-id-2',
          },
        ],
        invitationRows: [
          {
            email: 'invitee@example.com',
            expiresAt: '2026-09-01T00:00:00.000Z',
            id: 'private-invitation-id',
            role: 'member',
          },
        ],
      },
      new Date('2026-08-30T00:00:00.000Z')
    );

    expect(state).toEqual({
      status: 'active',
      organization,
      members: [
        {
          email: 'owner@example.com',
          joinedAt: '2026-08-28T00:00:00.000Z',
          name: 'Owner',
          role: 'owner',
        },
        {
          email: 'member@example.com',
          joinedAt: '2026-08-29T00:00:00.000Z',
          name: 'Member',
          role: 'member',
        },
      ],
      invitations: [
        {
          email: 'invitee@example.com',
          expiresAt: '2026-09-01T00:00:00.000Z',
          role: 'member',
          status: 'pending',
        },
      ],
      hasMoreMembers: false,
      hasMoreInvitations: false,
    });
    expect(JSON.stringify(state)).not.toContain('private-');
  });

  it('marks expired invitations and keeps restricted organizations readable', () => {
    const state = resolveOrganizationMembersState(
      {
        membership: {
          billingCustomerId: 'private-customer-id',
          maxSeats: 12,
          name: 'Acme Engineering',
          role: 'admin',
          slug: 'acme-engineering',
          status: 'past_due',
          tier: 'team',
          usedSeats: 12,
        },
        memberRows: [],
        invitationRows: [
          {
            email: 'invitee@example.com',
            expiresAt: '2026-08-01T00:00:00.000Z',
            id: 'private-invitation-id',
            role: 'admin',
          },
        ],
      },
      new Date('2026-08-30T00:00:00.000Z')
    );

    expect(state.status).toBe('restricted');
    if (state.status !== 'restricted') throw new Error('Expected a restricted workspace');
    expect(state.invitations).toEqual([
      {
        email: 'invitee@example.com',
        expiresAt: '2026-08-01T00:00:00.000Z',
        role: 'admin',
        status: 'expired',
      },
    ]);
  });

  it('fails closed when any member or invitation boundary row is malformed', () => {
    const boundary = {
      membership: {
        billingCustomerId: 'private-customer-id',
        maxSeats: 12,
        name: 'Acme Engineering',
        role: 'owner',
        slug: 'acme-engineering',
        status: 'active',
        tier: 'team',
        usedSeats: 2,
      },
      memberRows: [{ email: 'not-an-email', name: 'Member', role: 'member' }],
      invitationRows: [],
    };

    expect(resolveOrganizationMembersState(boundary, new Date())).toEqual({
      status: 'unavailable',
    });
  });
});

describe('organization D1 boundary', () => {
  function database(options: {
    readonly activeOrganizationRow?: object | null;
    readonly entitlementRows: ReadonlyArray<object>;
    readonly fail?: boolean;
    readonly invitationRows?: ReadonlyArray<object>;
    readonly memberRows?: ReadonlyArray<object>;
    readonly membershipLimitRow?: object | null;
    readonly membershipRow?: object | null;
    readonly slugRow?: object | null;
    readonly summaryRow?: object | null;
  }) {
    let batchSize = 0;
    const bindings: Array<{ readonly sql: string; readonly values: ReadonlyArray<unknown> }> = [];
    const db: OrganizationDatabase = {
      batch: async (statements: Array<OrganizationStatement>) => {
        if (options.fail === true) throw new Error('database unavailable');
        batchSize = statements.length;
        return [];
      },
      dump: async () => new ArrayBuffer(0),
      exec: async () => ({ count: 0, duration: 0 }),
      prepare: (sql: string) => ({
        all: async () => ({ results: [] }),
        bind: (...values: Array<unknown>) => {
          bindings.push({ sql, values });
          return {
            all: async () => {
              if (options.fail === true) throw new Error('database unavailable');
              if (sql.includes('FROM customers')) {
                return { results: options.entitlementRows };
              }
              if (sql.includes('FROM auth_user')) {
                return { results: options.memberRows ?? [] };
              }
              if (sql.includes('FROM auth_invitation')) {
                return { results: options.invitationRows ?? [] };
              }
              return { results: [] };
            },
            bind: () => {
              throw new Error('bind may only be called once');
            },
            first: async () => {
              if (options.fail === true) throw new Error('database unavailable');
              if (sql.includes('COALESCE(')) {
                return options.activeOrganizationRow ?? { organizationId: null };
              }
              if (sql.includes('FROM auth_member') && sql.includes('organization.id')) {
                return options.summaryRow ?? null;
              }
              if (sql.includes('FROM auth_member')) {
                return options.membershipRow ?? null;
              }
              if (sql.includes('maxSeats')) {
                return options.membershipLimitRow ?? null;
              }
              return options.slugRow ?? null;
            },
            raw: async () => [],
            run: async () => ({ success: true }),
          };
        },
        first: async () => null,
        raw: async () => [],
        run: async () => ({ success: true }),
      }),
      withSession: () => db,
    };
    return { db, bindings, getBatchSize: () => batchSize };
  }

  it('atomically creates an owner organization from a paid entitlement', async () => {
    const fixture = database({
      entitlementRows: [
        {
          customerId: 'private-customer-id',
          maxSeats: 8,
          status: 'active',
          tier: 'team',
        },
      ],
    });

    await bootstrapOrganization(VERIFIED_IDENTITY, fixture.db, {
      name: 'Acme Engineering',
      slug: 'acme-engineering',
    });

    expect(fixture.getBatchSize()).toBe(3);
    expect(fixture.bindings.some(binding => binding.values.includes('private-customer-id'))).toBe(
      true
    );
    expect(fixture.bindings.some(binding => binding.values.includes('private-user-id'))).toBe(true);
    expect(fixture.bindings.some(binding => binding.values.includes('private-session-token'))).toBe(
      true
    );
  });

  it('rejects ineligible plans and conflicting slugs before the transaction', async () => {
    const ineligible = database({
      entitlementRows: [
        { customerId: 'private-customer-id', maxSeats: null, status: 'active', tier: 'pro' },
      ],
    });
    const conflict = database({
      entitlementRows: [
        { customerId: 'private-customer-id', maxSeats: 8, status: 'active', tier: 'team' },
      ],
      slugRow: { id: 'private-organization-id' },
    });

    await expect(
      bootstrapOrganization(VERIFIED_IDENTITY, ineligible.db, {
        name: 'Acme Engineering',
        slug: 'acme-engineering',
      })
    ).rejects.toBeInstanceOf(OrganizationBootstrapForbidden);
    await expect(
      bootstrapOrganization(VERIFIED_IDENTITY, conflict.db, {
        name: 'Acme Engineering',
        slug: 'acme-engineering',
      })
    ).rejects.toBeInstanceOf(OrganizationBootstrapConflict);
    expect(ineligible.getBatchSize()).toBe(0);
    expect(conflict.getBatchSize()).toBe(0);
  });

  it('reports a transaction failure instead of presenting a successful result', async () => {
    const unavailable = database({
      entitlementRows: [
        { customerId: 'private-customer-id', maxSeats: 8, status: 'active', tier: 'team' },
      ],
      fail: true,
    });

    await expect(
      bootstrapOrganization(VERIFIED_IDENTITY, unavailable.db, {
        name: 'Acme Engineering',
        slug: 'acme-engineering',
      })
    ).rejects.toMatchObject({ _tag: 'OrganizationBootstrapUnavailable' });
  });

  it('loads a browser-safe workspace state from parameterized D1 rows', async () => {
    const fixture = database({
      entitlementRows: [
        {
          customerId: 'private-customer-id',
          maxSeats: 8,
          status: 'active',
          tier: 'team',
        },
      ],
    });

    const state = await loadOrganizationWorkspaceState(VERIFIED_IDENTITY, fixture.db);

    expect(state).toEqual({ status: 'eligible', tier: 'team', maxSeats: 8 });
    expect(JSON.stringify(state)).not.toContain('private-customer-id');
    expect(fixture.bindings.some(binding => binding.values.includes('private-user-id'))).toBe(true);
    expect(fixture.bindings.some(binding => binding.values.includes('owner@example.com'))).toBe(
      true
    );
  });

  it('loads the active organization roster through hidden server references', async () => {
    const fixture = database({
      activeOrganizationRow: { organizationId: 'private-organization-id' },
      entitlementRows: [],
      invitationRows: [
        {
          email: 'invitee@example.com',
          expiresAt: '2026-09-01T00:00:00.000Z',
          id: 'private-invitation-id',
          role: 'member',
        },
      ],
      memberRows: [
        {
          email: 'owner@example.com',
          id: 'private-member-id',
          joinedAt: '2026-08-28T00:00:00.000Z',
          name: 'Owner',
          role: 'owner',
          userId: 'private-user-id',
        },
      ],
      summaryRow: {
        billingCustomerId: 'private-customer-id',
        maxSeats: 8,
        name: 'Acme Engineering',
        role: 'owner',
        slug: 'acme-engineering',
        status: 'active',
        tier: 'team',
        usedSeats: 1,
      },
    });

    const state = await loadOrganizationMembersState(
      VERIFIED_IDENTITY,
      fixture.db,
      new Date('2026-08-30T00:00:00.000Z')
    );

    expect(state.status).toBe('active');
    expect(JSON.stringify(state)).not.toContain('private-');
    expect(fixture.bindings[0]?.values).toEqual([
      'private-user-id',
      'private-session-token',
      'private-user-id',
    ]);
  });

  it('returns no-organization without querying roster tables', async () => {
    const fixture = database({
      activeOrganizationRow: { organizationId: null },
      entitlementRows: [],
    });

    await expect(
      loadOrganizationMembersState(
        VERIFIED_IDENTITY,
        fixture.db,
        new Date('2026-08-30T00:00:00.000Z')
      )
    ).resolves.toEqual({ status: 'no-organization' });
    expect(fixture.bindings).toHaveLength(1);
  });

  it('reports membership-limit lookup failures explicitly', async () => {
    const available = database({
      entitlementRows: [],
      membershipLimitRow: { maxSeats: 9 },
    });
    const unavailable = database({ entitlementRows: [], fail: true });

    await expect(loadOrganizationMembershipLimit(available.db, 'organization-1')).resolves.toBe(9);
    await expect(
      loadOrganizationMembershipLimit(unavailable.db, 'organization-1')
    ).rejects.toBeInstanceOf(OrganizationMembershipLimitUnavailable);
  });
});

describe('readOrganizationBootstrapForm', () => {
  it('normalizes a bounded workspace name and slug', async () => {
    const request = new Request('https://shadow.example/dashboard/organization/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=Acme+Engineering&slug=Acme-Engineering',
    });

    const result = await Effect.runPromise(readOrganizationBootstrapForm(request));

    expect(result).toEqual({ name: 'Acme Engineering', slug: 'acme-engineering' });
  });

  it('rejects invalid and oversized forms before database work', async () => {
    const invalid = new Request('https://shadow.example/dashboard/organization/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=A&slug=not valid',
    });
    const oversized = new Request('https://shadow.example/dashboard/organization/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `name=${'x'.repeat(9000)}&slug=acme`,
    });

    const invalidExit = await Effect.runPromiseExit(readOrganizationBootstrapForm(invalid));
    const oversizedExit = await Effect.runPromiseExit(readOrganizationBootstrapForm(oversized));

    expect(Exit.isFailure(invalidExit)).toBe(true);
    if (Exit.isFailure(invalidExit)) {
      expect(invalidExit.cause.toString()).toContain(OrganizationBootstrapInvalid.name);
    }
    expect(Exit.isFailure(oversizedExit)).toBe(true);
  });
});
