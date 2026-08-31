import '../src/cloudflare-test.d.ts';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import type { OrganizationUsageRequest } from '../../../shared/organization-usage';
import { OrganizationUsageResponseSchema } from '../src/contracts/organization-usage';
import worker from '../src/worker';

const ErrorPayloadSchema = Schema.Struct({ error: Schema.String });

function organizationUsageRequest(
  body: OrganizationUsageRequest,
  includePrivateHeaders = true
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (includePrivateHeaders) {
    headers.set('X-Admin-Secret', 'organization-usage-test-secret');
    headers.set('X-Internal-Call', 'service-binding');
  }
  return new Request('http://localhost/api/internal/organization-usage', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function createOrganizationUsageFixture(): Promise<{
  readonly organizationId: string;
  readonly userId: string;
}> {
  const suffix = crypto.randomUUID();
  const customerId = `usage-customer-${suffix}`;
  const licenseId = `usage-license-${suffix}`;
  const organizationId = `usage-organization-${suffix}`;
  const ownerUserId = `usage-owner-${suffix}`;
  const memberUserId = `usage-member-${suffix}`;
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'team')`).bind(
      customerId,
      `billing-${suffix}@example.com`
    ),
    env.DB.prepare(
      `INSERT INTO licenses
        (id, customer_id, license_key, tier, status, max_seats, max_machines)
       VALUES (?, ?, ?, 'team', 'active', 3, 10)`
    ).bind(licenseId, customerId, `usage-key-${suffix}`),
    env.DB.prepare(
      `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Owner', ?, 1, ?, ?)`
    ).bind(ownerUserId, `owner-${suffix}@example.com`, now, now),
    env.DB.prepare(
      `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Member', ?, 1, ?, ?)`
    ).bind(memberUserId, `member-${suffix}@example.com`, now, now),
    env.DB.prepare(
      `INSERT INTO auth_organization
        (id, name, slug, billing_customer_id, created_at)
       VALUES (?, 'Acme Engineering', ?, ?, ?)`
    ).bind(organizationId, `acme-${suffix}`, customerId, now),
    env.DB.prepare(
      `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'owner', ?)`
    ).bind(`owner-member-${suffix}`, organizationId, ownerUserId, now),
    env.DB.prepare(
      `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'member', ?)`
    ).bind(`accepted-member-${suffix}`, organizationId, memberUserId, now),
    env.DB.prepare(
      `INSERT INTO machines
        (id, license_id, machine_id, hostname, omg_version, user_email, last_seen_at, is_active)
       VALUES (?, ?, ?, 'owner-machine', '1.2.3', ?, datetime('now', '-1 day'), 1)`
    ).bind(
      `owner-machine-row-${suffix}`,
      licenseId,
      `owner-machine-${suffix}`,
      `owner-${suffix}@example.com`
    ),
    env.DB.prepare(
      `INSERT INTO machines
        (id, license_id, machine_id, hostname, omg_version, user_email, last_seen_at, is_active)
       VALUES (?, ?, ?, 'member-machine', '1.1.0', ?, datetime('now', '-10 days'), 1)`
    ).bind(
      `member-machine-row-${suffix}`,
      licenseId,
      `member-machine-${suffix}`,
      `member-${suffix}@example.com`
    ),
    env.DB.prepare(
      `INSERT INTO machines
        (id, license_id, machine_id, hostname, omg_version, user_email, last_seen_at, is_active)
       VALUES (?, ?, ?, 'unattributed-machine', NULL, NULL, datetime('now', '-2 days'), 1)`
    ).bind(`unattributed-machine-row-${suffix}`, licenseId, `unattributed-machine-${suffix}`),
    env.DB.prepare(
      `INSERT INTO usage_member_daily
        (id, license_id, machine_id, date, commands_run, packages_installed, runtimes_switched, time_saved_ms)
       VALUES (?, ?, ?, ?, 10, 2, 1, 1000)`
    ).bind(`owner-usage-${suffix}`, licenseId, `owner-machine-${suffix}`, today),
    env.DB.prepare(
      `INSERT INTO usage_member_daily
        (id, license_id, machine_id, date, commands_run, packages_installed, runtimes_switched, time_saved_ms)
       VALUES (?, ?, ?, ?, 7, 1, 2, 500)`
    ).bind(`member-usage-${suffix}`, licenseId, `member-machine-${suffix}`, today),
    env.DB.prepare(
      `INSERT INTO usage_member_daily
        (id, license_id, machine_id, date, commands_run, packages_installed, runtimes_switched, time_saved_ms)
       VALUES (?, ?, ?, ?, 5, 1, 0, 250)`
    ).bind(`unattributed-usage-${suffix}`, licenseId, `unattributed-machine-${suffix}`, today),
    env.DB.prepare(
      `INSERT INTO usage_member_daily
        (id, license_id, machine_id, date, commands_run, packages_installed, runtimes_switched, time_saved_ms)
       VALUES (?, ?, ?, ?, 3, 0, 1, 100)`
    ).bind(`orphan-usage-${suffix}`, licenseId, `orphan-machine-${suffix}`, today),
  ]);

  return { organizationId, userId: ownerUserId };
}

describe('POST /api/internal/organization-usage', () => {
  it('requires the private service-binding boundary', async () => {
    env.SVELTE_BFF_SECRET = 'organization-usage-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      organizationUsageRequest({ organizationId: 'org', userId: 'user' }, false),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });

  it('returns grounded member usage and keeps unattributed fleet activity separate', async () => {
    env.SVELTE_BFF_SECRET = 'organization-usage-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const fixture = await createOrganizationUsageFixture();
    const ctx = createExecutionContext();
    const response = await worker.fetch(organizationUsageRequest(fixture), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const raw = await response.json();
    const payload = Schema.decodeUnknownSync(OrganizationUsageResponseSchema)(raw);
    expect(payload.organization).toEqual({
      name: 'Acme Engineering',
      role: 'owner',
      status: 'active',
      tier: 'team',
    });
    expect(payload.seats).toEqual({ used: 2, limit: 3 });
    expect(payload.members).toEqual([
      {
        email: expect.stringMatching(/^owner-/u),
        name: 'Owner',
        role: 'owner',
        attributedMachines: 1,
        usage: { commands: 10, packagesInstalled: 2, runtimeSwitches: 1, timeSavedMs: 1000 },
      },
      {
        email: expect.stringMatching(/^member-/u),
        name: 'Member',
        role: 'member',
        attributedMachines: 1,
        usage: { commands: 7, packagesInstalled: 1, runtimeSwitches: 2, timeSavedMs: 500 },
      },
    ]);
    expect(payload.unattributed).toEqual({
      machines: 1,
      usage: { commands: 8, packagesInstalled: 1, runtimeSwitches: 1, timeSavedMs: 350 },
    });
    expect(payload.fleet).toEqual({
      activeMachines: 3,
      seenWithinSevenDays: 2,
      notSeenWithinSevenDays: 1,
      versions: [
        { version: null, machines: 1 },
        { version: '1.1.0', machines: 1 },
        { version: '1.2.3', machines: 1 },
      ],
      hasMoreVersions: false,
    });
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(fixture.organizationId);
    expect(serialized).not.toContain(fixture.userId);
    expect(serialized).not.toContain('usage-key-');
    expect(serialized).not.toContain('machine-row-');
  });

  it('does not reveal whether a cross-tenant organization exists', async () => {
    env.SVELTE_BFF_SECRET = 'organization-usage-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const fixture = await createOrganizationUsageFixture();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      organizationUsageRequest({ ...fixture, userId: `foreign-${crypto.randomUUID()}` }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(Schema.decodeUnknownSync(ErrorPayloadSchema)(await response.json())).toEqual({
      error: 'Organization not found',
    });
  });
});
