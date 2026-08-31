import '../src/cloudflare-test.d.ts';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import worker from '../src/worker';

const DirectorySchema = Schema.Struct({
  organizations: Schema.Array(Schema.Struct({ name: Schema.String, slug: Schema.String })),
  pagination: Schema.Struct({ total: Schema.Number }),
});
const SupportSchema = Schema.Struct({
  organization: Schema.Struct({ name: Schema.String, slug: Schema.String }),
  entitlement: Schema.Struct({
    tier: Schema.NullOr(Schema.String),
    licenseStatus: Schema.NullOr(Schema.String),
    access: Schema.String,
  }),
  seats: Schema.Struct({ used: Schema.Number, limit: Schema.NullOr(Schema.Number) }),
  members: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      email: Schema.String,
      role: Schema.String,
      joinedAt: Schema.String,
    })
  ),
  hasMoreMembers: Schema.Boolean,
  invitations: Schema.Array(
    Schema.Struct({
      email: Schema.String,
      role: Schema.String,
      status: Schema.String,
      expiresAt: Schema.String,
    })
  ),
  hasMoreInvitations: Schema.Boolean,
  usage: Schema.Struct({
    windowDays: Schema.Number,
    activeDays: Schema.Number,
    totals: Schema.Struct({
      commands: Schema.Number,
      packagesInstalled: Schema.Number,
      packagesSearched: Schema.Number,
      runtimeSwitches: Schema.Number,
      sbomsGenerated: Schema.Number,
      vulnerabilitiesFound: Schema.Number,
      timeSavedMs: Schema.Number,
    }),
  }),
  fleet: Schema.Struct({
    activeMachines: Schema.Number,
    seenWithinSevenDays: Schema.Number,
    notSeenWithinSevenDays: Schema.Number,
    versions: Schema.Array(
      Schema.Struct({ version: Schema.NullOr(Schema.String), machines: Schema.Number })
    ),
    hasMoreVersions: Schema.Boolean,
  }),
  audit: Schema.Struct({
    events: Schema.Array(
      Schema.Struct({
        action: Schema.String,
        role: Schema.NullOr(Schema.String),
        occurredAt: Schema.String,
      })
    ),
    hasMoreEvents: Schema.Boolean,
  }),
});

interface SupportFixture {
  readonly adminToken: string;
  readonly billingCustomerId: string;
  readonly licenseId: string;
  readonly memberId: string;
  readonly machineId: string;
  readonly organizationId: string;
  readonly slug: string;
}

async function request(path: string, token?: string): Promise<Response> {
  const ctx = createExecutionContext();
  const outboundRequest =
    token === undefined
      ? new Request(`http://localhost${path}`)
      : new Request(`http://localhost${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
  const response = await worker.fetch(outboundRequest, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function createSupportFixture(): Promise<SupportFixture> {
  const suffix = crypto.randomUUID();
  const adminCustomerId = `support-admin-customer-${suffix}`;
  const billingCustomerId = `support-billing-customer-${suffix}`;
  const adminToken = `support-admin-token-${suffix}`;
  const licenseId = `support-license-${suffix}`;
  const organizationId = `support-organization-${suffix}`;
  const memberId = `support-member-row-${suffix}`;
  const ownerUserId = `support-owner-user-${suffix}`;
  const machineId = `support-machine-private-${suffix}`;
  const slug = `support-${suffix}`;
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO customers (id, email, tier, admin) VALUES (?, ?, 'team', 1)`).bind(
      adminCustomerId,
      `operator-${suffix}@example.com`
    ),
    env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at)
       VALUES (?, ?, ?, datetime('now', '+1 hour'))`
    ).bind(`support-admin-session-${suffix}`, adminCustomerId, adminToken),
    env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'team')`).bind(
      billingCustomerId,
      `billing-${suffix}@example.com`
    ),
    env.DB.prepare(
      `INSERT INTO licenses
        (id, customer_id, license_key, tier, status, max_seats, max_machines)
       VALUES (?, ?, ?, 'team', 'active', 5, 10)`
    ).bind(licenseId, billingCustomerId, `support-license-key-${suffix}`),
    env.DB.prepare(
      `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Acme Owner', ?, 1, ?, ?)`
    ).bind(ownerUserId, `owner-${suffix}@example.com`, now, now),
    env.DB.prepare(
      `INSERT INTO auth_organization
        (id, name, slug, billing_customer_id, created_at)
       VALUES (?, 'Acme Engineering', ?, ?, ?)`
    ).bind(organizationId, slug, billingCustomerId, now),
    env.DB.prepare(
      `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'owner', ?)`
    ).bind(memberId, organizationId, ownerUserId, now),
    env.DB.prepare(
      `INSERT INTO auth_invitation
        (id, organization_id, email, role, status, expires_at, created_at, inviter_id)
       VALUES (?, ?, ?, 'member', 'pending', ?, ?, ?)`
    ).bind(
      `support-invitation-private-${suffix}`,
      organizationId,
      `invitee-${suffix}@example.com`,
      now + 60 * 60 * 1000,
      now,
      ownerUserId
    ),
    env.DB.prepare(
      `INSERT INTO machines
        (id, license_id, machine_id, hostname, omg_version, last_seen_at, is_active)
       VALUES (?, ?, ?, 'build-01', '1.4.0', datetime('now', '-1 day'), 1)`
    ).bind(`support-machine-row-${suffix}`, licenseId, machineId),
    env.DB.prepare(
      `INSERT INTO usage_daily
        (id, license_id, date, commands_run, packages_installed, packages_searched,
         runtimes_switched, sbom_generated, vulnerabilities_found, time_saved_ms)
       VALUES (?, ?, ?, 120, 8, 14, 3, 2, 4, 900000)`
    ).bind(`support-usage-private-${suffix}`, licenseId, today),
    env.DB.prepare(
      `INSERT INTO audit_log
        (id, customer_id, action, resource_type, metadata, created_at)
       VALUES (?, ?, 'organization.invitation.created', 'organization', ?, datetime('now'))`
    ).bind(
      `support-audit-private-${suffix}`,
      billingCustomerId,
      JSON.stringify({ role: 'member' })
    ),
  ]);

  return {
    adminToken,
    billingCustomerId,
    licenseId,
    memberId,
    machineId,
    organizationId,
    slug,
  };
}

describe('GET /api/admin/organizations', () => {
  it('requires an authorized operator session', async () => {
    const response = await request('/api/admin/organizations?page=1');
    expect(response.status).toBe(401);
  });

  it('returns only browser-safe summaries to an authorized operator', async () => {
    const suffix = crypto.randomUUID();
    const customerId = `directory-customer-${suffix}`;
    const token = `directory-token-${suffix}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (id, email, tier, admin) VALUES (?, ?, 'team', 1)`
      ).bind(customerId, `admin-${suffix}@example.com`),
      env.DB.prepare(
        `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '+1 hour'))`
      ).bind(`directory-session-${suffix}`, customerId, token),
      env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats) VALUES (?, ?, ?, 'team', 'active', 5)`
      ).bind(`directory-license-${suffix}`, customerId, `private-license-${suffix}`),
      env.DB.prepare(
        `INSERT INTO auth_organization (id, name, slug, billing_customer_id, created_at) VALUES (?, 'Acme Engineering', ?, ?, ?)`
      ).bind(`private-organization-${suffix}`, `acme-${suffix}`, customerId, Date.now()),
    ]);
    const response = await request('/api/admin/organizations?page=1&search=acme', token);
    expect(response.status).toBe(200);
    const raw = await response.json();
    const directory = Schema.decodeUnknownSync(DirectorySchema)(raw);
    expect(directory.organizations).toEqual([{ name: 'Acme Engineering', slug: `acme-${suffix}` }]);
    expect(directory.pagination.total).toBe(1);
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(customerId);
    expect(serialized).not.toContain(`private-organization-${suffix}`);
    expect(serialized).not.toContain(`private-license-${suffix}`);
    expect(serialized).not.toContain(token);
  });
});

describe('GET /api/admin/organizations/support', () => {
  it('requires an authorized operator session', async () => {
    const response = await request('/api/admin/organizations/support?slug=acme-engineering');
    expect(response.status).toBe(401);
  });

  it('denies an authenticated non-operator before organization lookup', async () => {
    const suffix = crypto.randomUUID();
    const customerId = `support-non-admin-${suffix}`;
    const token = `support-non-admin-token-${suffix}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (id, email, tier, admin) VALUES (?, ?, 'free', 0)`
      ).bind(customerId, `non-admin-${suffix}@example.com`),
      env.DB.prepare(
        `INSERT INTO sessions (id, customer_id, token, expires_at)
         VALUES (?, ?, ?, datetime('now', '+1 hour'))`
      ).bind(`support-non-admin-session-${suffix}`, customerId, token),
    ]);

    const response = await request('/api/admin/organizations/support?slug=does-not-exist', token);
    expect(response.status).toBe(403);
  });

  it('returns bounded support state selected by slug without private identifiers', async () => {
    const fixture = await createSupportFixture();
    const response = await request(
      `/api/admin/organizations/support?slug=${fixture.slug}`,
      fixture.adminToken
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const raw = await response.json();
    const support = Schema.decodeUnknownSync(SupportSchema)(raw);
    expect(support.organization).toEqual({ name: 'Acme Engineering', slug: fixture.slug });
    expect(support.entitlement).toEqual({
      tier: 'team',
      licenseStatus: 'active',
      access: 'active',
    });
    expect(support.seats).toEqual({ used: 1, limit: 5 });
    expect(support.members).toEqual([
      {
        name: 'Acme Owner',
        email: expect.stringMatching(/^owner-/u),
        role: 'owner',
        joinedAt: expect.stringMatching(/Z$/u),
      },
    ]);
    expect(support.invitations).toEqual([
      {
        email: expect.stringMatching(/^invitee-/u),
        role: 'member',
        status: 'pending',
        expiresAt: expect.stringMatching(/Z$/u),
      },
    ]);
    expect(support.usage).toEqual({
      windowDays: 30,
      activeDays: 1,
      totals: {
        commands: 120,
        packagesInstalled: 8,
        packagesSearched: 14,
        runtimeSwitches: 3,
        sbomsGenerated: 2,
        vulnerabilitiesFound: 4,
        timeSavedMs: 900000,
      },
    });
    expect(support.fleet).toEqual({
      activeMachines: 1,
      seenWithinSevenDays: 1,
      notSeenWithinSevenDays: 0,
      versions: [{ version: '1.4.0', machines: 1 }],
      hasMoreVersions: false,
    });
    expect(support.audit.events).toEqual([
      {
        action: 'organization.invitation.created',
        role: 'member',
        occurredAt: expect.stringMatching(/Z$/u),
      },
    ]);

    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(fixture.billingCustomerId);
    expect(serialized).not.toContain(fixture.licenseId);
    expect(serialized).not.toContain(fixture.memberId);
    expect(serialized).not.toContain(fixture.machineId);
    expect(serialized).not.toContain(fixture.organizationId);
    expect(serialized).not.toContain(fixture.adminToken);
    expect(serialized).not.toContain('support-license-key-');
    expect(serialized).not.toContain('support-invitation-private-');
    expect(serialized).not.toContain('support-audit-private-');
  });

  it('rejects raw identifiers and duplicate slug selections', async () => {
    const fixture = await createSupportFixture();
    const rawIdResponse = await request(
      `/api/admin/organizations/support?organizationId=${fixture.organizationId}`,
      fixture.adminToken
    );
    const duplicateResponse = await request(
      `/api/admin/organizations/support?slug=${fixture.slug}&slug=${fixture.slug}`,
      fixture.adminToken
    );

    expect(rawIdResponse.status).toBe(400);
    expect(duplicateResponse.status).toBe(400);
  });
});
