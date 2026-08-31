import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import worker from '../src/worker';

const ErrorPayloadSchema = Schema.Struct({ error: Schema.String });
const DashboardStatsPayloadSchema = Schema.Struct({
  global_stats: Schema.Struct({
    top_package: Schema.NullOr(Schema.String),
    top_runtime: Schema.NullOr(Schema.String),
    percentile: Schema.NullOr(Schema.Number),
  }),
});

async function decodeError(response: Response): Promise<{ readonly error: string }> {
  return Schema.decodeUnknownSync(ErrorPayloadSchema)(await response.json());
}

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
    env.API_RATE_LIMITER = { limit: async () => ({ success: true }) };
  });

  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM sessions WHERE customer_id IN (SELECT id FROM customers WHERE email = ?)`
    )
      .bind(TEST_EMAIL)
      .run();
    await env.DB.prepare(
      `DELETE FROM licenses WHERE customer_id IN (SELECT id FROM customers WHERE email = ?)`
    )
      .bind(TEST_EMAIL)
      .run();
    await env.DB.prepare(`DELETE FROM customers WHERE email = ?`).bind(TEST_EMAIL).run();
  });

  it('rate limits session routes before reading D1', async () => {
    env.API_RATE_LIMITER = { limit: async () => ({ success: false }) };
    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard('untrusted-session-token'), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(429);
  });

  it('uses a one-way token digest as the limiter key', async () => {
    const limiterKeys: string[] = [];
    env.API_RATE_LIMITER = {
      limit: async ({ key }: RateLimitOptions) => {
        limiterKeys.push(key);
        return { success: true };
      },
    };
    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard('untrusted-session-token'), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    expect(limiterKeys).toHaveLength(1);
    expect(limiterKeys[0]).toMatch(/^session_token:sha256:v1:[0-9a-f]{64}$/);
    expect(limiterKeys[0]).not.toContain('untrusted-session-token');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard(null), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    const payload = await decodeError(response);
    expect(payload.error).toBe('Authorization required');
  });

  it('returns 401 for an unknown session token', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard('not-a-session'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    const payload = await decodeError(response);
    expect(payload.error).toBe('Invalid or expired session');
  });

  it('updates the authenticated customer company field', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 0)`
    )
      .bind('dash-cust', TEST_EMAIL, 'Before')
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`
    )
      .bind('dash-sess', 'dash-cust', TEST_TOKEN, new Date(Date.now() + 60_000).toISOString())
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('http://localhost/api/user/profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company: 'After' }),
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const customer = await env.DB.prepare(`SELECT company FROM customers WHERE id = ?`)
      .bind('dash-cust')
      .first<{ company: string }>();
    expect(customer?.company).toBe('After');
  });

  it('returns null global metrics when the license has no usage', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 0)`
    )
      .bind('dash-cust', TEST_EMAIL, 'Dash')
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`
    )
      .bind('dash-sess', 'dash-cust', TEST_TOKEN, new Date(Date.now() + 60_000).toISOString())
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats, max_machines)
       VALUES (?, ?, ?, 'free', 'active', 1, 1)`
    )
      .bind('dash-license', 'dash-cust', 'OMG-DASH-TEST')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(getDashboard(TEST_TOKEN), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const payload = Schema.decodeUnknownSync(DashboardStatsPayloadSchema)(await response.json());
    expect(payload.global_stats).toEqual({
      top_package: null,
      top_runtime: null,
      percentile: null,
    });
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
    const payload = await decodeError(response);
    expect(payload.error).toBe('License not found');
  });
});
