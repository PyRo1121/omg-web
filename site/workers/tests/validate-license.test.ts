import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const TEST_EMAIL = 'validate-license@example.com';
const TEST_KEY = 'lic-validate-key';
const TEST_CUSTOMER = 'validate-cust';
const TEST_LICENSE = 'validate-lic';

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`)
    .run()
    .catch(() => undefined);
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      hostname TEXT,
      os TEXT,
      arch TEXT,
      omg_version TEXT,
      user_name TEXT,
      user_email TEXT,
      is_active INTEGER DEFAULT 1,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS usage_daily (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      date TEXT NOT NULL,
      commands_run INTEGER DEFAULT 0,
      packages_installed INTEGER DEFAULT 0,
      packages_searched INTEGER DEFAULT 0,
      runtimes_switched INTEGER DEFAULT 0,
      sbom_generated INTEGER DEFAULT 0,
      vulnerabilities_found INTEGER DEFAULT 0,
      time_saved_ms INTEGER DEFAULT 0
    )`
  ).run();
}

async function insertCustomer(): Promise<void> {
  await env.DB.prepare(`INSERT INTO customers (id, email, company, tier) VALUES (?, ?, ?, 'free')`)
    .bind(TEST_CUSTOMER, TEST_EMAIL, 'Ada')
    .run();
}

async function insertLicense(
  status: string,
  expiresAt: string | null,
  maxMachines = 1
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats, expires_at)
     VALUES (?, ?, ?, 'free', ?, ?, ?, ?)`
  )
    .bind(TEST_LICENSE, TEST_CUSTOMER, TEST_KEY, status, maxMachines, maxMachines, expiresAt)
    .run();
}

function postJson(serializedBody: string): Request {
  return new Request('http://localhost/api/validate-license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializedBody,
  });
}

describe('POST /api/validate-license', () => {
  beforeEach(async () => {
    env.JWT_SECRET = 'test-jwt-secret';
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM machines WHERE license_id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM usage_daily WHERE license_id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(TEST_CUSTOMER).run();
  });

  it('returns 400 when the license key is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(postJson(JSON.stringify({})), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    const payload = await response.json<{ error: string }>();
    expect(payload.error).toBe('License key required');
  });

  it('returns 400 when the body is not JSON', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('http://localhost/api/validate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('returns 400 when the key is not a string', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(postJson(JSON.stringify({ key: 123 })), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('returns valid:false for an unknown key', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(JSON.stringify({ license_key: 'missing-key' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ valid: boolean; error: string }>();
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe('Invalid license key');
  });

  it('returns valid:false for a suspended license', async () => {
    await insertCustomer();
    await insertLicense('suspended', null);
    const ctx = createExecutionContext();
    const response = await worker.fetch(postJson(JSON.stringify({ key: TEST_KEY })), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ valid: boolean; error: string }>();
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe('License is suspended');
  });

  it('returns valid:false for an expired license', async () => {
    await insertCustomer();
    await insertLicense('active', '2020-01-01T00:00:00.000Z');
    const ctx = createExecutionContext();
    const response = await worker.fetch(postJson(JSON.stringify({ key: TEST_KEY })), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ valid: boolean; error: string }>();
    expect(payload.valid).toBe(false);
    expect(payload.error).toBe('License has expired');
  });

  it('returns a token for an active license', async () => {
    await insertCustomer();
    await insertLicense('active', null);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(JSON.stringify({ license_key: TEST_KEY })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{
      valid: boolean;
      tier: string;
      token: string;
      customer: string;
      max_machines: number;
    }>();
    expect(payload.valid).toBe(true);
    expect(payload.tier).toBe('free');
    expect(payload.customer).toBe('Ada');
    expect(payload.max_machines).toBe(1);
    expect(payload.token.length).toBeGreaterThan(0);
  });

  it('rejects a new machine when the seat limit is reached', async () => {
    await insertCustomer();
    await insertLicense('active', null, 1);
    await env.DB.prepare(
      `INSERT INTO machines (id, license_id, machine_id, is_active) VALUES (?, ?, ?, 1)`
    )
      .bind('m-existing', TEST_LICENSE, 'machine-a')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(JSON.stringify({ key: TEST_KEY, machine_id: 'machine-b' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ valid: boolean; error: string }>();
    expect(payload.valid).toBe(false);
    expect(payload.error).toContain('Machine limit reached');
  });

  it('registers a new machine under the seat limit', async () => {
    await insertCustomer();
    await insertLicense('active', null, 2);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(JSON.stringify({ key: TEST_KEY, machine_id: 'machine-new' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ valid: boolean }>();
    expect(payload.valid).toBe(true);
    const stored = await env.DB.prepare(
      `SELECT machine_id FROM machines WHERE license_id = ? AND machine_id = ?`
    )
      .bind(TEST_LICENSE, 'machine-new')
      .first();
    expect(stored).not.toBeNull();
  });
});

describe('GET /api/validate-license', () => {
  beforeEach(async () => {
    env.JWT_SECRET = 'test-jwt-secret';
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM machines WHERE license_id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM usage_daily WHERE license_id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(TEST_CUSTOMER).run();
  });

  it('validates a key from the query string', async () => {
    await insertCustomer();
    await insertLicense('active', null);
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://localhost/api/validate-license?key=${TEST_KEY}`),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json<{ valid: boolean; token: string }>();
    expect(payload.valid).toBe(true);
    expect(payload.token.length).toBeGreaterThan(0);
  });
});
