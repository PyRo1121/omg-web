import '../src/cloudflare-test.d.ts';
import { Effect } from 'effect';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
import { decodeProvisionResponse } from '../src/contracts/provision';

const TEST_SECRET = 'test-admin-secret';
const TEST_EMAIL = 'provision@example.com';
const EXISTING_EMAIL = 'already-provisioned@example.com';

async function ensureSchema(): Promise<void> {
  await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`)
    .run()
    .catch(() => undefined);
}

function provisionRequest(secret: string | null, serializedBody: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (secret !== null) {
    headers.set('X-Admin-Secret', secret);
  }
  return new Request('http://localhost/api/provision-user', {
    method: 'POST',
    headers,
    body: serializedBody,
  });
}

describe('POST /api/provision-user', () => {
  beforeEach(async () => {
    env.ADMIN_API_SECRET = TEST_SECRET;
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM licenses WHERE customer_id IN (
      SELECT id FROM customers WHERE email IN (?, ?)
    )`
    )
      .bind(TEST_EMAIL, EXISTING_EMAIL)
      .run();
    await env.DB.prepare(`DELETE FROM customers WHERE email IN (?, ?)`)
      .bind(TEST_EMAIL, EXISTING_EMAIL)
      .run();
  });

  it('returns 400 when the email is invalid', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      provisionRequest(TEST_SECRET, JSON.stringify({ email: 'not-an-email' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('creates a customer and license for a new email', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      provisionRequest(TEST_SECRET, JSON.stringify({ email: TEST_EMAIL, name: 'Ada' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const decoded = await Effect.runPromise(decodeProvisionResponse(await response.json()));
    expect(decoded.success).toBe(true);
    expect(decoded.licenseKey.length).toBeGreaterThan(0);

    const customer = await env.DB.prepare(
      `SELECT id, email, company FROM customers WHERE email = ?`
    )
      .bind(TEST_EMAIL)
      .first();
    expect(customer).toEqual(
      expect.objectContaining({
        email: TEST_EMAIL,
        company: 'Ada',
        id: decoded.customerId,
      })
    );

    const license = await env.DB.prepare(
      `SELECT license_key FROM licenses WHERE customer_id = ? AND status = 'active'`
    )
      .bind(decoded.customerId)
      .first();
    expect(license).toEqual(expect.objectContaining({ license_key: decoded.licenseKey }));
  });

  it('reuses an existing active license', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier) VALUES (?, ?, ?, 'free')`
    )
      .bind('exist-cust', EXISTING_EMAIL, 'Existing')
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
       VALUES (?, ?, ?, 'free', 'active', 1)`
    )
      .bind('exist-lic', 'exist-cust', 'existing-key')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      provisionRequest(TEST_SECRET, JSON.stringify({ email: EXISTING_EMAIL })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const decoded = await Effect.runPromise(decodeProvisionResponse(await response.json()));
    expect(decoded.customerId).toBe('exist-cust');
    expect(decoded.licenseKey).toBe('existing-key');
    expect(decoded.message).toBe('Customer already exists');
  });

  it('issues a license when the customer exists without one', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier) VALUES (?, ?, ?, 'free')`
    )
      .bind('bare-cust', TEST_EMAIL, 'Bare')
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      provisionRequest(TEST_SECRET, JSON.stringify({ email: TEST_EMAIL })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const decoded = await Effect.runPromise(decodeProvisionResponse(await response.json()));
    expect(decoded.customerId).toBe('bare-cust');
    expect(decoded.licenseKey.length).toBeGreaterThan(0);
    expect(decoded.message).toBeUndefined();
  });
});
