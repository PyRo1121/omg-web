import '../src/cloudflare-test.d.ts';
import { Effect } from 'effect';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
import { sendVerificationCode } from '../src/handlers/auth';

const TEST_EMAIL = 'otp@example.com';
const VICTIM_EMAIL = 'victim@example.com';

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS auth_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.DB.prepare(`ALTER TABLE customers ADD COLUMN admin INTEGER DEFAULT 0`)
    .run()
    .catch(() => undefined);
  await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`)
    .run()
    .catch(() => undefined);
}

function postJson(path: string, serializedBody: string, token: string | null = null): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: serializedBody,
  });
}

function getPath(path: string, token: string | null = null): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

describe('POST /api/auth/send-code', () => {
  beforeEach(async () => {
    await ensureSchema();
    env.RESEND_API_KEY = undefined;
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM auth_codes WHERE email = ?`).bind(TEST_EMAIL).run();
  });

  it('returns 400 when the email is invalid', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/auth/send-code', JSON.stringify({ email: 'not-an-email' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('returns 500 when email delivery is not configured', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/auth/send-code', JSON.stringify({ email: TEST_EMAIL })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(500);
  });

  it('persists a code when the mailer succeeds', async () => {
    const request = postJson('/api/auth/send-code', JSON.stringify({ email: TEST_EMAIL }));
    const exit = await Effect.runPromiseExit(sendVerificationCode(request, env, () => Effect.void));
    expect(exit._tag).toBe('Success');
    const stored = await env.DB.prepare(`SELECT email FROM auth_codes WHERE email = ?`)
      .bind(TEST_EMAIL)
      .first();
    expect(stored).not.toBeNull();
  });
});

describe('POST /api/auth/verify-code', () => {
  beforeEach(async () => {
    await ensureSchema();
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
    await env.DB.prepare(`DELETE FROM auth_codes WHERE email = ?`).bind(TEST_EMAIL).run();
  });

  it('returns 401 for an unknown code', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/auth/verify-code', JSON.stringify({ email: TEST_EMAIL, code: '000000' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('mints a session for a valid code', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO auth_codes (id, email, code, expires_at, used) VALUES (?, ?, ?, ?, 0)`
    )
      .bind('code-1', TEST_EMAIL, '123456', expiresAt)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/auth/verify-code', JSON.stringify({ email: TEST_EMAIL, code: '123456' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ token: string; success: boolean }>();
    expect(payload.success).toBe(true);
    expect(payload.token.length).toBeGreaterThan(0);
  });
});

describe('admin analytics endpoints require an admin session', () => {
  it('returns 401 for GET /api/docs/analytics/dashboard without a token', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(getPath('/api/docs/analytics/dashboard'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for GET /api/site/analytics/overview without a token', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(getPath('/api/site/analytics/overview'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/billing/portal email override', () => {
  const attackerToken = 'attacker-token';

  beforeEach(async () => {
    await ensureSchema();
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin, stripe_customer_id)
       VALUES (?, ?, ?, 'free', 0, NULL)`
    )
      .bind('attacker', TEST_EMAIL, 'Attacker')
      .run();
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin, stripe_customer_id)
       VALUES (?, ?, ?, 'pro', 0, ?)`
    )
      .bind('victim', VICTIM_EMAIL, 'Victim', 'cus_victim')
      .run();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`
    )
      .bind('sess-attacker', 'attacker', attackerToken, expiresAt)
      .run();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind('sess-attacker').run();
    await env.DB.prepare(`DELETE FROM customers WHERE id IN (?, ?)`)
      .bind('attacker', 'victim')
      .run();
  });

  it('does not open another customer portal for a non-admin', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/billing/portal', JSON.stringify({ email: VICTIM_EMAIL }), attackerToken),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });
});
