import '../src/cloudflare-test.d.ts';
import { Effect } from 'effect';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
import { decodeAdminSessionWorkerResponse } from '../src/contracts/admin-session';

const TEST_SECRET = 'test-admin-secret';
const TEST_EMAIL = 'admin-session@example.com';
const NON_ADMIN_EMAIL = 'user-session@example.com';

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(`ALTER TABLE customers ADD COLUMN admin INTEGER DEFAULT 0`)
    .run()
    .catch(() => undefined);
  await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`)
    .run()
    .catch(() => undefined);
}

function createSessionRequest(secret: string | null, serializedBody: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (secret !== null) {
    headers.set('X-Admin-Secret', secret);
  }
  return new Request('http://localhost/api/admin/create-session', {
    method: 'POST',
    headers,
    body: serializedBody,
  });
}

describe('POST /api/admin/create-session', () => {
  beforeEach(async () => {
    env.ADMIN_API_SECRET = TEST_SECRET;
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

  it('returns 403 when the customer is not an admin', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 0)`
    )
      .bind('user-cust', NON_ADMIN_EMAIL, 'User')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: NON_ADMIN_EMAIL })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
  });

  it('creates a session for a new admin customer', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: TEST_EMAIL, name: 'Ada' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const decoded = await Effect.runPromise(
      decodeAdminSessionWorkerResponse(await response.json())
    );
    expect(decoded.token.length).toBeGreaterThan(0);
    expect(decoded.expiresAt.length).toBeGreaterThan(0);
    expect(decoded.customerId.length).toBeGreaterThan(0);
  });

  it('reuses an existing unexpired session', async () => {
    const firstCtx = createExecutionContext();
    const first = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: TEST_EMAIL, name: 'Ada' })),
      env,
      firstCtx
    );
    await waitOnExecutionContext(firstCtx);
    const firstBody = await Effect.runPromise(decodeAdminSessionWorkerResponse(await first.json()));

    const secondCtx = createExecutionContext();
    const second = await worker.fetch(
      createSessionRequest(TEST_SECRET, JSON.stringify({ email: TEST_EMAIL, name: 'Ada' })),
      env,
      secondCtx
    );
    await waitOnExecutionContext(secondCtx);
    const secondBody = await Effect.runPromise(
      decodeAdminSessionWorkerResponse(await second.json())
    );
    expect(second.status).toBe(200);
    expect(secondBody.token).toBe(firstBody.token);
  });
});
