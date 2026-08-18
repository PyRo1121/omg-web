import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const TEST_EMAIL = 'dashboard@example.com';
const TEST_TOKEN = 'dashboard-session-token';

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(`ALTER TABLE customers ADD COLUMN admin INTEGER DEFAULT 0`)
    .run()
    .catch(() => undefined);
  await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`)
    .run()
    .catch(() => undefined);
}

function getDashboard(token: string | null): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request('http://localhost/api/dashboard', { method: 'GET', headers });
}

describe('GET /api/dashboard', () => {
  beforeEach(async () => {
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(TEST_TOKEN).run();
    await env.DB.prepare(
      `DELETE FROM licenses WHERE customer_id IN (SELECT id FROM customers WHERE email = ?)`
    )
      .bind(TEST_EMAIL)
      .run();
    await env.DB.prepare(`DELETE FROM customers WHERE email = ?`).bind(TEST_EMAIL).run();
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard(null), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    const payload = await response.json<{ error: string }>();
    expect(payload.error).toBe('Authorization required');
  });

  it('returns 401 for an unknown session token', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard('not-a-session'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    const payload = await response.json<{ error: string }>();
    expect(payload.error).toBe('Invalid or expired session');
  });

  it('returns 404 when the customer has no license', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 0)`
    )
      .bind('dash-cust', TEST_EMAIL, 'Dash')
      .run();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`
    )
      .bind('dash-sess', 'dash-cust', TEST_TOKEN, expiresAt)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard(TEST_TOKEN), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
    const payload = await response.json<{ error: string }>();
    expect(payload.error).toBe('License not found');
  });
});
