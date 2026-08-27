import '../src/cloudflare-test.d.ts';
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
import { decodeSiteSessionWorkerResponse } from '../../shared/site-session';

const TEST_SECRET = 'test-admin-secret';
const TEST_EMAIL = 'site-session-admin@example.com';
const NON_ADMIN_EMAIL = 'site-session-user@example.com';

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(`ALTER TABLE customers ADD COLUMN admin INTEGER DEFAULT 0`)
    .run()
    .catch(() => undefined);
  await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`)
    .run()
    .catch(() => undefined);
}

function createSessionRequest(secret: string | null, serializedBody: string): Request {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Internal-Call': 'service-binding',
  });
  if (secret !== null) {
    headers.set('X-Admin-Secret', secret);
  }
  return new Request('http://localhost/api/internal/site-session', {
    method: 'POST',
    headers,
    body: serializedBody,
  });
}

describe('POST /api/internal/site-session', () => {
  beforeEach(async () => {
    env.ADMIN_API_SECRET = TEST_SECRET;
    env.SVELTE_BFF_SECRET = '';
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM sessions WHERE customer_id IN (
      SELECT id FROM customers WHERE email IN (?, ?)
    )`
    )
      .bind(TEST_EMAIL, NON_ADMIN_EMAIL)
      .run();
    await env.DB.prepare(
      `DELETE FROM licenses WHERE customer_id IN (
      SELECT id FROM customers WHERE email IN (?, ?)
    )`
    )
      .bind(TEST_EMAIL, NON_ADMIN_EMAIL)
      .run();
    await env.DB.prepare(`DELETE FROM customers WHERE email IN (?, ?)`)
      .bind(TEST_EMAIL, NON_ADMIN_EMAIL)
      .run();
  });

  it('returns 401 when the secret is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(null, JSON.stringify({ email: TEST_EMAIL })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 when the secret is wrong', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest('wrong-secret', JSON.stringify({ email: TEST_EMAIL })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('accepts the caller-specific Svelte BFF secret', async () => {
    env.SVELTE_BFF_SECRET = 'test-svelte-bff-secret';
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(
        'test-svelte-bff-secret',
        JSON.stringify({ email: NON_ADMIN_EMAIL, role: 'user' })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
  });

  it('returns 400 when the body is invalid', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: 'not-an-email' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('creates a session for an existing non-admin user', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 0)`
    )
      .bind('user-cust', NON_ADMIN_EMAIL, 'User')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: NON_ADMIN_EMAIL, role: 'user' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
  });

  it('revokes stale licensing-admin state when Better Auth reports a user role', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 1)`
    )
      .bind('stale-admin-cust', NON_ADMIN_EMAIL, 'Former Admin')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: NON_ADMIN_EMAIL, role: 'user' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const customer = Schema.decodeUnknownSync(Schema.Struct({ admin: Schema.Number }))(
      await env.DB.prepare(`SELECT admin FROM customers WHERE email = ?`)
        .bind(NON_ADMIN_EMAIL)
        .first()
    );

    expect(response.status).toBe(200);
    expect(customer.admin).toBe(0);
  });

  it('provisions a new user without granting admin access', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(
        TEST_SECRET,
        JSON.stringify({ email: NON_ADMIN_EMAIL, name: 'Lin', role: 'user' })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const customer = Schema.decodeUnknownSync(Schema.Struct({ admin: Schema.Number }))(
      await env.DB.prepare(`SELECT admin FROM customers WHERE email = ?`)
        .bind(NON_ADMIN_EMAIL)
        .first()
    );

    expect(response.status).toBe(200);
    expect(customer.admin).toBe(0);
  });

  it('creates a session for a new admin customer', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(
        TEST_SECRET,
        JSON.stringify({ email: TEST_EMAIL, name: 'Ada', role: 'admin' })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const decoded = await Effect.runPromise(decodeSiteSessionWorkerResponse(await response.json()));
    expect(decoded.token.length).toBeGreaterThan(0);
    expect(decoded.expiresAt.length).toBeGreaterThan(0);
    expect(decoded.customerId.length).toBeGreaterThan(0);
  });

  it('reuses an existing unexpired session', async () => {
    const firstCtx = createExecutionContext();
    const first = await worker.fetch(
      createSessionRequest(
        TEST_SECRET,
        JSON.stringify({ email: TEST_EMAIL, name: 'Ada', role: 'admin' })
      ),
      env,
      firstCtx
    );
    await waitOnExecutionContext(firstCtx);
    const firstBody = await Effect.runPromise(decodeSiteSessionWorkerResponse(await first.json()));

    const secondCtx = createExecutionContext();
    const second = await worker.fetch(
      createSessionRequest(
        TEST_SECRET,
        JSON.stringify({ email: TEST_EMAIL, name: 'Ada', role: 'admin' })
      ),
      env,
      secondCtx
    );
    await waitOnExecutionContext(secondCtx);
    const secondBody = await Effect.runPromise(
      decodeSiteSessionWorkerResponse(await second.json())
    );
    expect(second.status).toBe(200);
    expect(secondBody.token).toBe(firstBody.token);
  });
});
