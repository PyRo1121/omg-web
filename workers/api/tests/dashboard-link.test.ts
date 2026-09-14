import '../src/cloudflare-test.d.ts';
import { describe, expect, it, beforeEach } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';

const TEST_CUSTOMER = 'customer-link-test';
const TEST_TOKEN = 'dashboard-link-test-token';

interface LinkCredentialBody {
  readonly license_key: string;
  readonly tier: string;
  readonly expires_at: string | null;
  readonly machine_count: number;
}

async function seedSchema(): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      tier TEXT DEFAULT 'free',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      license_key TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      status TEXT DEFAULT 'active',
      max_machines INTEGER,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      token_hash TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function seedSession(): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO customers (id, email) VALUES (?, ?)')
    .bind(TEST_CUSTOMER, 'link@example.com')
    .run();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '+1 day'))"
  )
    .bind('session-link-test', TEST_CUSTOMER, TEST_TOKEN)
    .run();
}

async function callLink(): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request('https://omg-api.latham.cloud/api/dashboard/link', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    }),
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function linkBody(): Promise<LinkCredentialBody> {
  const response = await callLink();
  expect(response.status).toBe(200);
  // SAFETY: the worker routed this through DashboardLinkResponseSchema before serializing.
  return (await response.json()) as LinkCredentialBody;
}

describe('POST /api/dashboard/link', () => {
  beforeEach(async () => {
    await env.DB.exec(
      'DELETE FROM sessions; DELETE FROM machines; DELETE FROM licenses; DELETE FROM customers;'
    );
    await seedSchema();
    await seedSession();
  });

  it('provisions the free license and returns a CLI-grammar credential', async () => {
    const body = await linkBody();
    expect(body.license_key).toMatch(/^[a-z0-9]{64}$/);
    expect(body.tier).toBe('free');
    expect(body.expires_at).toBeNull();
    expect(body.machine_count).toBe(0);
  });

  it('returns the same credential on repeat calls without extra license rows', async () => {
    const first = await linkBody();
    const second = await linkBody();
    expect(first.license_key).toBe(second.license_key);
    // SAFETY: count rows for the seeded customer against the provisioned license.
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM licenses WHERE customer_id = ?')
      .bind(TEST_CUSTOMER)
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it('requires a valid Bearer session', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('https://omg-api.latham.cloud/api/dashboard/link', { method: 'POST' }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it('reports linked active machines', async () => {
    await callLink();
    // SAFETY: the provisioning query created exactly one license for the seeded customer.
    const license = await env.DB.prepare('SELECT id FROM licenses WHERE customer_id = ?')
      .bind(TEST_CUSTOMER)
      .first<{ id: string }>();
    await env.DB.prepare(
      'INSERT INTO machines (id, license_id, machine_id, hostname, is_active) VALUES (?, ?, ?, ?, 1)'
    )
      .bind('machine-1', license?.id, 'machine-id-1', 'laptop')
      .run();
    const body = await linkBody();
    expect(body.machine_count).toBe(1);
  });
});
