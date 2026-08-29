import '../src/cloudflare-test.d.ts';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import type { OrganizationAuditRequest } from '../../shared/organization-audit';
import { OrganizationAuditResponseSchema } from '../src/contracts/organization-audit';
import worker from '../src/worker';

function organizationAuditRequest(
  body: OrganizationAuditRequest,
  includePrivateHeaders = true
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (includePrivateHeaders) {
    headers.set('X-Admin-Secret', 'organization-audit-test-secret');
    headers.set('X-Internal-Call', 'service-binding');
  }
  return new Request('http://localhost/api/internal/organization-audit', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function createOrganizationAuditFixture(): Promise<{
  readonly customerId: string;
  readonly licenseId: string;
  readonly organizationId: string;
  readonly userId: string;
}> {
  const suffix = crypto.randomUUID();
  const customerId = `audit-customer-${suffix}`;
  const licenseId = `audit-license-${suffix}`;
  const organizationId = `audit-organization-${suffix}`;
  const userId = `audit-owner-${suffix}`;
  const now = Date.now();
  const statements = [
    env.DB.prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'team')`).bind(
      customerId,
      `billing-${suffix}@example.com`
    ),
    env.DB.prepare(
      `INSERT INTO licenses
        (id, customer_id, license_key, tier, status, max_seats, max_machines)
       VALUES (?, ?, ?, 'team', 'active', 4, 10)`
    ).bind(licenseId, customerId, `audit-license-key-${suffix}`),
    env.DB.prepare(
      `INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Owner', ?, 1, ?, ?)`
    ).bind(userId, `owner-${suffix}@example.com`, now, now),
    env.DB.prepare(
      `INSERT INTO auth_organization
        (id, name, slug, billing_customer_id, created_at)
       VALUES (?, 'Acme Engineering', ?, ?, ?)`
    ).bind(organizationId, `audit-${suffix}`, customerId, now),
    env.DB.prepare(
      `INSERT INTO auth_member (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'owner', ?)`
    ).bind(`audit-membership-${suffix}`, organizationId, userId, now),
  ];
  for (let index = 0; index < 27; index += 1) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO audit_log
          (id, customer_id, action, resource_type, metadata, created_at)
         VALUES (?, ?, 'organization.member.role_changed', 'organization', ?, ?)`
      ).bind(
        `private-member-event-${suffix}-${index.toString().padStart(2, '0')}`,
        customerId,
        JSON.stringify({ role: index % 2 === 0 ? 'admin' : 'member' }),
        new Date(Date.UTC(2026, 7, 28, 12, index)).toISOString()
      )
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_log
        (id, customer_id, action, resource_type, metadata, created_at)
       VALUES (?, ?, 'organization.invitation.created', 'organization', ?, ?)`
    ).bind(
      `private-invitation-event-${suffix}`,
      customerId,
      JSON.stringify({ role: 'member' }),
      '2026-08-29T12:00:00.000Z'
    ),
    env.DB.prepare(
      `INSERT INTO audit_log
        (id, customer_id, action, resource_type, metadata, created_at)
       VALUES (?, ?, 'organization.invitation.revoked', 'organization', NULL, ?)`
    ).bind(`private-revoke-event-${suffix}`, customerId, '2026-08-29T11:00:00.000Z'),
    env.DB.prepare(
      `INSERT INTO audit_log
        (id, customer_id, action, resource_type, metadata, created_at)
       VALUES (?, ?, 'license.validated', 'license', NULL, ?)`
    ).bind(`unrelated-event-${suffix}`, customerId, '2026-08-29T10:00:00.000Z')
  );
  await env.DB.batch(statements);
  return { customerId, licenseId, organizationId, userId };
}

async function fetchAudit(input: OrganizationAuditRequest) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(organizationAuditRequest(input), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe('POST /api/internal/organization-audit', () => {
  it('requires the private service-binding boundary', async () => {
    env.SVELTE_BFF_SECRET = 'organization-audit-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      organizationAuditRequest(
        { organizationId: 'organization', userId: 'user', filter: 'all', page: 1 },
        false
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });

  it('returns bounded member history without private audit or tenant identifiers', async () => {
    env.SVELTE_BFF_SECRET = 'organization-audit-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const fixture = await createOrganizationAuditFixture();
    const response = await fetchAudit({ ...fixture, filter: 'members', page: 1 });

    expect(response.status).toBe(200);
    const raw = await response.json();
    const payload = Schema.decodeUnknownSync(OrganizationAuditResponseSchema)(raw);
    expect(payload.organization).toEqual({
      name: 'Acme Engineering',
      role: 'owner',
      status: 'active',
      tier: 'team',
    });
    expect(payload.filter).toBe('members');
    expect(payload.page).toBe(1);
    expect(payload.pageSize).toBe(25);
    expect(payload.hasMore).toBe(true);
    expect(payload.events).toHaveLength(25);
    expect(payload.events.every(event => event.action.startsWith('organization.member.'))).toBe(
      true
    );
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(fixture.organizationId);
    expect(serialized).not.toContain(fixture.userId);
    expect(serialized).not.toContain(fixture.customerId);
    expect(serialized).not.toContain(fixture.licenseId);
    expect(serialized).not.toContain('private-member-event-');
    expect(serialized).not.toContain('audit-license-key-');
  });

  it('filters invitation events and paginates deterministically', async () => {
    env.SVELTE_BFF_SECRET = 'organization-audit-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const fixture = await createOrganizationAuditFixture();
    const invitationResponse = await fetchAudit({ ...fixture, filter: 'invitations', page: 1 });
    const memberPageTwoResponse = await fetchAudit({ ...fixture, filter: 'members', page: 2 });

    const invitations = Schema.decodeUnknownSync(OrganizationAuditResponseSchema)(
      await invitationResponse.json()
    );
    const memberPageTwo = Schema.decodeUnknownSync(OrganizationAuditResponseSchema)(
      await memberPageTwoResponse.json()
    );
    expect(invitations.events.map(event => event.action)).toEqual([
      'organization.invitation.created',
      'organization.invitation.revoked',
    ]);
    expect(invitations.hasMore).toBe(false);
    expect(memberPageTwo.events).toHaveLength(2);
    expect(memberPageTwo.hasMore).toBe(false);
  });

  it('preserves restricted reads and rejects malformed stored metadata', async () => {
    env.SVELTE_BFF_SECRET = 'organization-audit-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const restrictedFixture = await createOrganizationAuditFixture();
    await env.DB.prepare(`UPDATE licenses SET status = 'past_due' WHERE id = ?`)
      .bind(restrictedFixture.licenseId)
      .run();
    const restrictedResponse = await fetchAudit({
      ...restrictedFixture,
      filter: 'all',
      page: 1,
    });
    const restricted = Schema.decodeUnknownSync(OrganizationAuditResponseSchema)(
      await restrictedResponse.json()
    );
    expect(restricted.organization.status).toBe('restricted');

    const malformedFixture = await createOrganizationAuditFixture();
    await env.DB.prepare(
      `INSERT INTO audit_log
        (id, customer_id, action, resource_type, metadata, created_at)
       VALUES (?, ?, 'organization.member.removed', 'organization', ?, ?)`
    )
      .bind(
        `malformed-audit-${crypto.randomUUID()}`,
        malformedFixture.customerId,
        '{"role":"forbidden"}',
        '2030-01-01T00:00:00.000Z'
      )
      .run();
    const malformedResponse = await fetchAudit({
      ...malformedFixture,
      filter: 'all',
      page: 1,
    });
    expect(malformedResponse.status).toBe(503);
  });

  it('does not reveal whether a cross-tenant organization exists', async () => {
    env.SVELTE_BFF_SECRET = 'organization-audit-test-secret';
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
    const fixture = await createOrganizationAuditFixture();
    const response = await fetchAudit({
      ...fixture,
      userId: `foreign-${crypto.randomUUID()}`,
      filter: 'all',
      page: 1,
    });

    expect(response.status).toBe(404);
  });
});
