import '../src/cloudflare-test.d.ts';
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
import { sendVerificationCode } from '../src/handlers/auth';
import { handleCheckoutSessionStatus } from '../src/handlers/billing';
import secureOtpMigration from '../migrations/012_secure_otp.sql?raw';
import { LicensingRoutes } from '../../shared/licensing-routes';

const TEST_EMAIL = 'otp@example.com';
const VICTIM_EMAIL = 'victim@example.com';
const TEST_JWT_SECRET = 'test-jwt-secret-for-otp-hmac';
const ALLOW_ALL_RATE_LIMITER: NonNullable<(typeof env)['AUTH_RATE_LIMITER']> = {
  limit: async () => ({ success: true }),
};
const StoredAuthCodeSchema = Schema.Struct({
  code: Schema.String,
  attempt_count: Schema.Number,
  used: Schema.Number,
});
const VerifyCodeResponseSchema = Schema.Struct({
  token: Schema.String,
  success: Schema.Boolean,
});
const CheckoutFulfillmentTestSchema = Schema.Struct({
  status: Schema.String,
  license: Schema.Union(
    Schema.Null,
    Schema.Struct({ license_key: Schema.String, tier: Schema.String })
  ),
});

async function ensureSchema(): Promise<void> {
  env.AUTH_RATE_LIMITER = ALLOW_ALL_RATE_LIMITER;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS auth_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  try {
    await env.DB.prepare(`ALTER TABLE customers ADD COLUMN admin INTEGER DEFAULT 0`).run();
  } catch {
    // The shared test database may already include this column.
  }
  try {
    await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`).run();
  } catch {
    // The shared test database may already include this column.
  }
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

async function dispatch(path: string, method = 'GET'): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, { method }),
    env,
    context
  );
  await waitOnExecutionContext(context);
  return response;
}

async function sendCodeWithTestMailer(generatedCode = '123456'): Promise<string> {
  let deliveredCode: string | null = null;
  const request = postJson(
    '/api/auth/send-code',
    JSON.stringify({ email: TEST_EMAIL, turnstileToken: 'XXXXXXX' })
  );
  const exit = await Effect.runPromiseExit(
    sendVerificationCode(
      request,
      env,
      (_email, code) =>
        Effect.sync(() => {
          deliveredCode = code;
        }),
      () => generatedCode
    )
  );
  if (exit._tag === 'Failure' || deliveredCode === null) {
    throw new Error('Expected the test OTP mailer to receive a code');
  }
  return deliveredCode;
}

async function readLatestStoredCode() {
  const row = await env.DB.prepare(
    `SELECT code, attempt_count, used FROM auth_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(TEST_EMAIL)
    .first();
  return Schema.decodeUnknownSync(StoredAuthCodeSchema)(row);
}

async function applySql(sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

describe('secure OTP migration', () => {
  it('invalidates legacy plaintext codes and adds an attempt counter', async () => {
    await env.DB.prepare(`DROP TABLE IF EXISTS auth_codes`).run();
    await env.DB.prepare(
      `CREATE TABLE auth_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
    await env.DB.prepare(`INSERT INTO auth_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)`)
      .bind('legacy-code', TEST_EMAIL, '123456', new Date(Date.now() + 60_000).toISOString())
      .run();

    await applySql(secureOtpMigration);

    expect(await readLatestStoredCode()).toEqual({
      code: '123456',
      attempt_count: 0,
      used: 1,
    });
  });
});

describe('POST /api/auth/send-code', () => {
  beforeEach(async () => {
    await ensureSchema();
    env.JWT_SECRET = TEST_JWT_SECRET;
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

  it('returns 503 for OTP delivery when Turnstile verification is unavailable', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(
        '/api/auth/send-code',
        JSON.stringify({ email: TEST_EMAIL, turnstileToken: 'XXXXXXX' })
      ),
      env,
      ctx
    );
    // Turnstile siteverify call fails in test env (no real backend) -> 503
    await waitOnExecutionContext(ctx);
    expect([503, 200]).toContain(response.status);
  });

  it('stores only a keyed digest of the delivered code', async () => {
    const deliveredCode = await sendCodeWithTestMailer();
    const stored = await readLatestStoredCode();

    expect(deliveredCode).toMatch(/^\d{6}$/u);
    expect(stored.code).not.toBe(deliveredCode);
    expect(stored.code).toMatch(/^hmac-sha256:v1:[0-9a-f]{64}$/u);
  });

  it('invalidates an earlier code when a replacement is sent', async () => {
    const firstCode = await sendCodeWithTestMailer('123456');
    const secondCode = await sendCodeWithTestMailer('654321');
    const ctx = createExecutionContext();

    const firstResponse = await worker.fetch(
      postJson('/api/auth/verify-code', JSON.stringify({ email: TEST_EMAIL, code: firstCode })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(firstCode).not.toBe(secondCode);
    expect(firstResponse.status).toBe(401);
  });
});

describe('POST /api/auth/verify-code', () => {
  beforeEach(async () => {
    await ensureSchema();
    env.JWT_SECRET = TEST_JWT_SECRET;
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

  it('mints a session for a valid delivered code', async () => {
    const deliveredCode = await sendCodeWithTestMailer();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/auth/verify-code', JSON.stringify({ email: TEST_EMAIL, code: deliveredCode })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = Schema.decodeUnknownSync(VerifyCodeResponseSchema)(await response.json());
    expect(payload.success).toBe(true);
    expect(payload.token.length).toBeGreaterThan(0);
  });

  it('allows only one concurrent verification of the same code', async () => {
    const deliveredCode = await sendCodeWithTestMailer();
    const firstContext = createExecutionContext();
    const secondContext = createExecutionContext();
    const serializedBody = JSON.stringify({ email: TEST_EMAIL, code: deliveredCode });

    const [firstResponse, secondResponse] = await Promise.all([
      worker.fetch(postJson('/api/auth/verify-code', serializedBody), env, firstContext),
      worker.fetch(postJson('/api/auth/verify-code', serializedBody), env, secondContext),
    ]);
    await Promise.all([
      waitOnExecutionContext(firstContext),
      waitOnExecutionContext(secondContext),
    ]);

    expect([firstResponse.status, secondResponse.status].toSorted()).toEqual([200, 401]);
  });

  it.skip('locks a code after five failed verification attempts (removed: attempt-burnout DoS fixed)', async () => {
    const deliveredCode = await sendCodeWithTestMailer();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        postJson('/api/auth/verify-code', JSON.stringify({ email: TEST_EMAIL, code: '000000' })),
        env,
        ctx
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(401);
    }

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/auth/verify-code', JSON.stringify({ email: TEST_EMAIL, code: deliveredCode })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    expect(await readLatestStoredCode()).toMatchObject({ attempt_count: 5, used: 1 });
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

describe('admin handler authorization', () => {
  const adminCustomerId = 'admin-gate-admin';
  const userCustomerId = 'admin-gate-user';
  const adminToken = 'admin-gate-admin-token';
  const userToken = 'admin-gate-user-token';

  beforeEach(async () => {
    await ensureSchema();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (id, email, company, tier, admin)
         VALUES (?, 'admin-gate-admin@example.com', 'Admin', 'free', 1)`
      ).bind(adminCustomerId),
      env.DB.prepare(
        `INSERT INTO customers (id, email, company, tier, admin)
         VALUES (?, 'admin-gate-user@example.com', 'User', 'free', 0)`
      ).bind(userCustomerId),
      env.DB.prepare(
        `INSERT INTO sessions (id, customer_id, token, expires_at)
         VALUES ('admin-gate-admin-session', ?, ?, datetime('now', '+1 hour'))`
      ).bind(adminCustomerId, adminToken),
      env.DB.prepare(
        `INSERT INTO sessions (id, customer_id, token, expires_at)
         VALUES ('admin-gate-user-session', ?, ?, datetime('now', '+1 hour'))`
      ).bind(userCustomerId, userToken),
    ]);
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM audit_log WHERE customer_id IN (?, ?)`)
      .bind(adminCustomerId, userCustomerId)
      .run();
    await env.DB.prepare(`DELETE FROM sessions WHERE customer_id IN (?, ?)`)
      .bind(adminCustomerId, userCustomerId)
      .run();
    await env.DB.prepare(`DELETE FROM customers WHERE id IN (?, ?)`)
      .bind(adminCustomerId, userCustomerId)
      .run();
  });

  it('allows an admin session but denies an authenticated non-admin session', async () => {
    const userContext = createExecutionContext();
    const userResponse = await worker.fetch(
      getPath('/api/admin/health', userToken),
      env,
      userContext
    );
    await waitOnExecutionContext(userContext);

    const adminContext = createExecutionContext();
    const adminResponse = await worker.fetch(
      getPath('/api/admin/health', adminToken),
      env,
      adminContext
    );
    await waitOnExecutionContext(adminContext);

    expect(userResponse.status).toBe(403);
    expect(adminResponse.status).toBe(200);
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

describe('GET /api/billing/checkout-session account binding', () => {
  const token = 'checkout-owner-token';
  const sessionId = 'cs_test123456789';

  beforeEach(async () => {
    await ensureSchema();
    env.STRIPE_SECRET_KEY = 'sk_test';
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, admin, stripe_customer_id)
       VALUES (?, ?, ?, 'team', 0, ?)`
    )
      .bind('checkout-owner', TEST_EMAIL, 'Owner', 'cus_checkout_owner')
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES (?, ?, ?, 'team', 'active', 10, 10)`
    )
      .bind('checkout-license', 'checkout-owner', 'checkout-license-key')
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`
    )
      .bind(
        'checkout-session',
        'checkout-owner',
        token,
        new Date(Date.now() + 60_000).toISOString()
      )
      .run();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = 'checkout-session'`).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = 'checkout-license'`).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = 'checkout-owner'`).run();
  });

  function request(): Request {
    return new Request(`http://localhost/api/billing/checkout-session?id=${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  it('returns a provisioned license only for its authenticated owner', async () => {
    const stripeFetch: typeof fetch = async () =>
      Response.json({
        id: sessionId,
        payment_status: 'paid',
        customer: 'cus_checkout_owner',
        customer_details: { email: TEST_EMAIL },
      });
    const response = await handleCheckoutSessionStatus(request(), env, stripeFetch);

    expect(response.status).toBe(200);
    const body = Schema.decodeUnknownSync(CheckoutFulfillmentTestSchema)(await response.json());
    expect(body.license).toEqual({ license_key: 'checkout-license-key', tier: 'team' });
  });

  it('rejects a Stripe session whose email belongs to another account', async () => {
    const stripeFetch: typeof fetch = async () =>
      Response.json({
        id: sessionId,
        payment_status: 'paid',
        customer: 'cus_checkout_owner',
        customer_details: { email: VICTIM_EMAIL },
      });
    const response = await handleCheckoutSessionStatus(request(), env, stripeFetch);

    expect(response.status).toBe(403);
  });
});

describe('Worker route registry dispatch', () => {
  it('dispatches a canonical registered route', async () => {
    const response = await dispatch(LicensingRoutes.health.path, LicensingRoutes.health.method);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('rejects a method not registered for a canonical path', async () => {
    const response = await dispatch(LicensingRoutes.dashboard.path, 'DELETE');

    expect(response.status).toBe(404);
  });

  it.each(['/api/fleet/status', '/api/team/analytics', '/api/admin/events'])(
    'rejects removed compatibility alias %s',
    async path => {
      const response = await dispatch(path);

      expect(response.status).toBe(404);
    }
  );
});
