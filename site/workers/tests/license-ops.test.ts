import '../src/cloudflare-test.d.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import worker from '../src/worker';

const AnalyticsResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  processed: Schema.Number,
});

const TEST_EMAIL = 'report-usage@example.com';
const TEST_KEY = 'lic-report-key';
const TEST_CUSTOMER = 'report-cust';
const TEST_LICENSE = 'report-lic';
const GET_LICENSE_ATTACKER = 'get-license-attacker';
const GET_LICENSE_ATTACKER_TOKEN = 'get-license-attacker-token';

async function ensureSchema(): Promise<void> {
  try {
    await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`).run();
  } catch {
    // The isolated test database may already include this column.
  }
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
      time_saved_ms INTEGER DEFAULT 0,
      UNIQUE(license_id, date)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      hostname TEXT,
      os TEXT,
      arch TEXT,
      omg_version TEXT,
      is_active INTEGER DEFAULT 1
    )`
  ).run();
}

async function insertActiveLicense(): Promise<void> {
  await env.DB.prepare(`INSERT INTO customers (id, email, company, tier) VALUES (?, ?, ?, 'free')`)
    .bind(TEST_CUSTOMER, TEST_EMAIL, 'Ada')
    .run();
  await env.DB.prepare(
    `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
     VALUES (?, ?, ?, 'free', 'active', 1, 1)`
  )
    .bind(TEST_LICENSE, TEST_CUSTOMER, TEST_KEY)
    .run();
}

function postJson(path: string, serializedBody: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializedBody,
  });
}

describe('POST /api/report-usage', () => {
  beforeEach(async () => {
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM usage_package_daily WHERE license_id = ?`)
      .bind(TEST_LICENSE)
      .run();
    await env.DB.prepare(`DELETE FROM usage_runtime_daily WHERE license_id = ?`)
      .bind(TEST_LICENSE)
      .run();
    await env.DB.prepare(`DELETE FROM usage_daily WHERE license_id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(TEST_CUSTOMER).run();
  });

  it('returns 400 when license_key is missing', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/report-usage', JSON.stringify({})),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('returns 401 for an unknown license', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/report-usage', JSON.stringify({ license_key: 'missing' })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('upserts daily usage for an active license', async () => {
    await insertActiveLicense();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/report-usage', JSON.stringify({ license_key: TEST_KEY, commands_run: 4 })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(`SELECT commands_run FROM usage_daily WHERE license_id = ?`)
      .bind(TEST_LICENSE)
      .first<{ commands_run: number }>();
    expect(stored?.commands_run).toBe(4);
  });

  it('rejects usage counters beyond the accepted boundary', async () => {
    await insertActiveLicense();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(
        '/api/report-usage',
        JSON.stringify({ license_key: TEST_KEY, commands_run: 1_000_000_001 })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('stores package and runtime dimensions per license without changing global aggregates', async () => {
    await insertActiveLicense();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(
        '/api/report-usage',
        JSON.stringify({
          license_key: TEST_KEY,
          installed_packages: { ripgrep: 4 },
          runtime_usage_counts: { node: 3 },
        })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);

    const packageRow = await env.DB.prepare(
      `SELECT usage_count FROM usage_package_daily WHERE license_id = ? AND package_name = ?`
    )
      .bind(TEST_LICENSE, 'ripgrep')
      .first<{ usage_count: number }>();
    const runtimeRow = await env.DB.prepare(
      `SELECT usage_count FROM usage_runtime_daily WHERE license_id = ? AND runtime = ?`
    )
      .bind(TEST_LICENSE, 'node')
      .first<{ usage_count: number }>();
    const globalPackage = await env.DB.prepare(
      `SELECT install_count FROM analytics_packages WHERE package_name = ?`
    )
      .bind('ripgrep')
      .first();
    expect(packageRow?.usage_count).toBe(4);
    expect(runtimeRow?.usage_count).toBe(3);
    expect(globalPackage).toBeNull();
  });

  it('discards anonymous product analytics instead of changing global metrics', async () => {
    const sessionId = `anonymous-${crypto.randomUUID()}`;
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson(
        '/api/analytics',
        JSON.stringify({
          events: [
            {
              event_type: 'command',
              event_name: 'search',
              timestamp: new Date().toISOString(),
              session_id: sessionId,
              machine_id: 'anonymous-machine',
              version: '1.0.0',
              platform: 'linux',
            },
          ],
        })
      ),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = Schema.decodeUnknownSync(AnalyticsResponseSchema)(await response.json());
    expect(body).toEqual({ success: true, processed: 0 });
    const stored = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM analytics_events WHERE session_id = ?`
    )
      .bind(sessionId)
      .first<{ count: number }>();
    expect(stored?.count).toBe(0);
  });
});

describe('GET /api/get-license', () => {
  beforeEach(async () => {
    await ensureSchema();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM sessions WHERE customer_id = ?`)
      .bind(GET_LICENSE_ATTACKER)
      .run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = ?`).bind(TEST_LICENSE).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id IN (?, ?)`)
      .bind(TEST_CUSTOMER, GET_LICENSE_ATTACKER)
      .run();
  });

  it('returns 401 without authentication', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('http://localhost/api/get-license'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 without authentication for unknown email lookup', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('http://localhost/api/get-license?email=nobody@example.com'),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 without authentication for known email lookup', async () => {
    await insertActiveLicense();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://localhost/api/get-license?email=${TEST_EMAIL}`),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('returns 403 when an authenticated customer requests another customer license', async () => {
    await insertActiveLicense();
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier)
       VALUES (?, 'get-license-attacker@example.com', 'Attacker', 'free')`
    )
      .bind(GET_LICENSE_ATTACKER)
      .run();
    await env.DB.prepare(
      `INSERT INTO sessions (id, customer_id, token, expires_at)
       VALUES ('get-license-attacker-session', ?, ?, datetime('now', '+1 hour'))`
    )
      .bind(GET_LICENSE_ATTACKER, GET_LICENSE_ATTACKER_TOKEN)
      .run();

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://localhost/api/get-license?email=${TEST_EMAIL}`, {
        headers: { Authorization: `Bearer ${GET_LICENSE_ATTACKER_TOKEN}` },
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(403);
  });
});

describe('POST /api/analytics', () => {
  beforeEach(async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        event_name TEXT,
        properties TEXT,
        timestamp TEXT,
        session_id TEXT,
        machine_id TEXT,
        license_key TEXT,
        version TEXT,
        platform TEXT,
        duration_ms INTEGER,
        created_at DATETIME
      )`
    ).run();
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS analytics_daily (
        date TEXT,
        metric TEXT,
        dimension TEXT,
        value INTEGER,
        PRIMARY KEY (date, metric, dimension)
      )`
    ).run();
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS analytics_active_users (
        date TEXT,
        machine_id TEXT,
        PRIMARY KEY (date, machine_id)
      )`
    ).run();
  });

  it('returns processed 0 for an empty batch', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/analytics', JSON.stringify({ events: [] })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    // SAFETY: response is a known JSON shape from our own handler
    const payload = (await response.json()) as { success: boolean; processed: number };
    expect(payload.processed).toBe(0);
  });

  it('returns 400 for a malformed event', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      postJson('/api/analytics', JSON.stringify({ events: [{ event_type: 1 }] })),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });
});
