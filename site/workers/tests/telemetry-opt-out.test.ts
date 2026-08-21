import '../src/cloudflare-test.d.ts';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import worker from '../src/worker';

const CUSTOMER_ID = 'opt-out-customer';
const LICENSE_ID = 'opt-out-license';
const LICENSE_KEY = 'opt-out-license-key';
const MACHINE_ID = 'opt-out-machine';
const CountRowSchema = Schema.Struct({ count: Schema.Number });

type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

function postJson(path: string, body: JsonValue): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function fetchWorker(request: Request): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(request, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function createIngestionTables(): Promise<void> {
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
}

async function countRows(table: string, predicate: string, value: string): Promise<number> {
  const result = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`)
    .bind(value)
    .first();
  const decoded = Schema.decodeUnknownEither(CountRowSchema)(result);
  if (decoded._tag === 'Left') {
    throw new Error(`Unable to count rows in ${table}`);
  }
  return decoded.right.count;
}

describe('telemetry opt-out ingestion policy', () => {
  beforeEach(async () => {
    await createIngestionTables();
    await env.DB.prepare(
      `INSERT INTO customers (id, email, company, tier, telemetry_opt_out, created_at)
       VALUES (?, 'opt-out@example.com', 'Opt Out Corp', 'pro', 1, datetime('now'))`
    )
      .bind(CUSTOMER_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, created_at)
       VALUES (?, ?, ?, 'pro', 'active', 3, datetime('now'))`
    )
      .bind(LICENSE_ID, CUSTOMER_ID, LICENSE_KEY)
      .run();
  });

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM command_event WHERE license_id = ?').bind(LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM usage_daily WHERE license_id = ?').bind(LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM machines WHERE license_id = ?').bind(LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM analytics_events WHERE license_key = ?')
      .bind(LICENSE_KEY)
      .run();
    await env.DB.prepare('DELETE FROM analytics_active_users WHERE machine_id = ?')
      .bind(MACHINE_ID)
      .run();
    await env.DB.prepare('DELETE FROM analytics_daily').run();
    await env.DB.prepare('DELETE FROM licenses WHERE id = ?').bind(LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(CUSTOMER_ID).run();
  });

  it('does not store a single CLI event', async () => {
    const response = await fetchWorker(
      postJson('/api/cli/event', {
        event: { type: 'command', command: 'search', success: true },
        timestamp: new Date().toISOString(),
        machine_id: MACHINE_ID,
        version: '1.0.0',
        platform: 'linux',
        license_key: LICENSE_KEY,
      })
    );

    expect(response.status).toBe(200);
    expect(await countRows('command_event', 'license_id = ?', LICENSE_ID)).toBe(0);
  });

  it('does not store a CLI event batch', async () => {
    const response = await fetchWorker(
      postJson('/api/cli/batch', {
        events: [
          {
            event: { type: 'command', command: 'search', success: true },
            timestamp: new Date().toISOString(),
            machine_id: MACHINE_ID,
            version: '1.0.0',
            platform: 'linux',
            license_key: LICENSE_KEY,
          },
        ],
        batch_timestamp: new Date().toISOString(),
        machine_id: MACHINE_ID,
      })
    );

    expect(response.status).toBe(200);
    expect(await countRows('command_event', 'license_id = ?', LICENSE_ID)).toBe(0);
  });

  it('does not store daily usage', async () => {
    const response = await fetchWorker(
      postJson('/api/report-usage', {
        license_key: LICENSE_KEY,
        machine_id: MACHINE_ID,
        commands_run: 12,
      })
    );

    expect(response.status).toBe(200);
    expect(await countRows('usage_daily', 'license_id = ?', LICENSE_ID)).toBe(0);
  });

  it('does not store analytics events or aggregates', async () => {
    const response = await fetchWorker(
      postJson('/api/analytics', {
        events: [
          {
            event_type: 'command',
            event_name: 'search',
            timestamp: new Date().toISOString(),
            session_id: 'opt-out-session',
            machine_id: MACHINE_ID,
            license_key: LICENSE_KEY,
            version: '1.0.0',
            platform: 'linux',
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(await countRows('analytics_events', 'license_key = ?', LICENSE_KEY)).toBe(0);
    expect(await countRows('analytics_active_users', 'machine_id = ?', MACHINE_ID)).toBe(0);
  });
});
