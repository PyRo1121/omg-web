import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import worker from '../src/worker';

const ErrorPayloadSchema = Schema.Struct({ error: Schema.String });
const InvalidLicensePayloadSchema = Schema.Struct({
  valid: Schema.Boolean,
  error: Schema.String,
});
const ValidLicensePayloadSchema = Schema.Struct({
  valid: Schema.Boolean,
  tier: Schema.String,
  token: Schema.String,
  customer: Schema.String,
  max_machines: Schema.Number,
});
const ValidPayloadSchema = Schema.Struct({ valid: Schema.Boolean });
const MachineVisibilityPayloadSchema = Schema.Struct({
  machines: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});
const LicenseJwtHeaderSchema = Schema.Struct({
  alg: Schema.Literal('EdDSA'),
  kid: Schema.Literal('omg-license-ed25519-v1'),
  typ: Schema.Literal('JWT'),
});
const LicenseJwtTimingSchema = Schema.Struct({
  iss: Schema.Literal('https://omg-api.latham.cloud'),
  aud: Schema.Literal('omg-cli'),
  iat: Schema.Number,
  exp: Schema.Number,
});

function decodeJwtSegment<S extends Schema.Schema.AnyNoContext>(
  token: string,
  segmentIndex: number,
  schema: S
): Schema.Schema.Type<S> {
  const encoded = token.split('.')[segmentIndex];
  if (encoded === undefined || encoded.length === 0) {
    throw new Error(`License token has no segment ${segmentIndex}`);
  }
  const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
  const parsed: unknown = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
  return Schema.decodeUnknownSync(schema)(parsed);
}

async function decodeResponse<S extends Schema.Schema.AnyNoContext>(
  response: Response,
  schema: S
): Promise<Schema.Schema.Type<S>> {
  return Schema.decodeUnknownSync(schema)(await response.json());
}

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIIx/ifT0yOyJ/SykVkxxVR4zdDCep94lm3xLOyNn83kM
-----END PRIVATE KEY-----`;
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
    env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY;
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
    const payload = await decodeResponse(response, ErrorPayloadSchema);
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
    const payload = await decodeResponse(response, InvalidLicensePayloadSchema);
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
    const payload = await decodeResponse(response, InvalidLicensePayloadSchema);
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
    const payload = await decodeResponse(response, InvalidLicensePayloadSchema);
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
    const payload = await decodeResponse(response, ValidLicensePayloadSchema);
    expect(payload.valid).toBe(true);
    expect(payload.tier).toBe('free');
    expect(payload.customer).toBe('Ada');
    expect(payload.max_machines).toBe(1);
    expect(payload.token.length).toBeGreaterThan(0);
    expect(decodeJwtSegment(payload.token, 0, LicenseJwtHeaderSchema)).toEqual({
      alg: 'EdDSA',
      kid: 'omg-license-ed25519-v1',
      typ: 'JWT',
    });
    const timing = decodeJwtSegment(payload.token, 1, LicenseJwtTimingSchema);
    expect(timing.iss).toBe('https://omg-api.latham.cloud');
    expect(timing.aud).toBe('omg-cli');
    expect(timing.exp - timing.iat).toBe(60 * 60);
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
    const payload = await decodeResponse(response, InvalidLicensePayloadSchema);
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
    const payload = await decodeResponse(response, ValidPayloadSchema);
    expect(payload.valid).toBe(true);
    const stored = await env.DB.prepare(
      `SELECT machine_id FROM machines WHERE license_id = ? AND machine_id = ?`
    )
      .bind(TEST_LICENSE, 'machine-new')
      .first();
    expect(stored).not.toBeNull();
  });

  it('returns only the current machine and excludes seat-owner PII', async () => {
    await insertCustomer();
    await insertLicense('active', null, 2);
    await env.DB.prepare(
      `INSERT INTO machines (id, license_id, machine_id, user_name, user_email, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
      .bind('m-other-seat', TEST_LICENSE, 'machine-other', 'Other User', 'other@example.com')
      .run();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(JSON.stringify({ key: TEST_KEY, machine_id: 'machine-current' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const payload = await decodeResponse(response, MachineVisibilityPayloadSchema);
    expect(payload.machines).toHaveLength(1);
    expect(payload.machines[0]?.['machine_id']).toBe('machine-current');
    expect(Object.hasOwn(payload.machines[0] ?? {}, 'user_name')).toBe(false);
    expect(Object.hasOwn(payload.machines[0] ?? {}, 'user_email')).toBe(false);
  });

  it('never exceeds the seat limit under concurrent registrations', async () => {
    await insertCustomer();
    await insertLicense('active', null, 1);
    const contexts = [createExecutionContext(), createExecutionContext()];
    const responses = await Promise.all([
      worker.fetch(
        postJson(JSON.stringify({ key: TEST_KEY, machine_id: 'machine-concurrent-a' })),
        env,
        contexts[0]
      ),
      worker.fetch(
        postJson(JSON.stringify({ key: TEST_KEY, machine_id: 'machine-concurrent-b' })),
        env,
        contexts[1]
      ),
    ]);
    await Promise.all(contexts.map(context => waitOnExecutionContext(context)));

    const payloads = await Promise.all(
      responses.map(response => decodeResponse(response, ValidPayloadSchema))
    );
    expect(payloads.filter(payload => payload.valid)).toHaveLength(1);
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM machines WHERE license_id = ? AND is_active = 1`
    )
      .bind(TEST_LICENSE)
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });
});

describe('GET /api/validate-license', () => {
  it('rejects query-string credentials because validation is POST-only', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://localhost/api/validate-license?key=${TEST_KEY}`),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });
});
