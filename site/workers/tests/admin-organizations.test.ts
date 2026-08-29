import '../src/cloudflare-test.d.ts';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import worker from '../src/worker';

const DirectorySchema = Schema.Struct({
  organizations: Schema.Array(Schema.Struct({ name: Schema.String, slug: Schema.String })),
  pagination: Schema.Struct({ total: Schema.Number }),
});

describe('GET /api/admin/organizations', () => {
  it('requires an authorized operator session', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('http://localhost/api/admin/organizations?page=1'),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
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
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('http://localhost/api/admin/organizations?page=1&search=acme', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
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
