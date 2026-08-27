import '../src/cloudflare-test.d.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import worker from '../src/worker';
import { createTestCustomer, deleteTestCustomer, type TestCustomer } from './test-utils';

const TeamMemberSchema = Schema.Struct({
  machine_id: Schema.String,
  hostname: Schema.NullOr(Schema.String),
  os: Schema.NullOr(Schema.String),
  arch: Schema.NullOr(Schema.String),
  omg_version: Schema.NullOr(Schema.String),
  last_seen_at: Schema.String,
  is_active: Schema.Boolean,
});
const PolicySchema = Schema.Struct({
  scope: Schema.String,
  rule: Schema.String,
  enforced: Schema.Boolean,
});
const AuditEntrySchema = Schema.Struct({
  action: Schema.String,
  resource_type: Schema.NullOr(Schema.String),
  resource_id: Schema.NullOr(Schema.String),
  ip_address: Schema.NullOr(Schema.String),
  created_at: Schema.String,
});

let customer: TestCustomer;

function licensedGet(path: string, licenseKey: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: {
      Authorization: `Bearer ${licenseKey}`,
      'CF-Connecting-IP': '203.0.113.55',
    },
  });
}

beforeEach(async () => {
  customer = await createTestCustomer(
    env.DB,
    `cli-team-${crypto.randomUUID()}@example.com`,
    'team'
  );
  await env.DB.prepare(
    `INSERT INTO machines (
         id, license_id, machine_id, hostname, os, arch, omg_version,
         is_active, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
  )
    .bind(
      `machine-row-${crypto.randomUUID()}`,
      customer.licenseId,
      'machine-public-id',
      'build-host',
      'linux',
      'x86_64',
      '0.1.215'
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO policies (id, license_id, scope, rule, value, enforced)
     VALUES (?, ?, 'security', 'require-signatures', 'true', 1)`
  )
    .bind(`policy-${crypto.randomUUID()}`, customer.licenseId)
    .run();
  await env.DB.prepare(
    `INSERT INTO audit_log (
       id, customer_id, action, resource_type, resource_id, ip_address, created_at
     ) VALUES (?, ?, 'license.validated', 'license', ?, '203.0.113.10', datetime('now'))`
  )
    .bind(`audit-${crypto.randomUUID()}`, customer.customerId, customer.licenseId)
    .run();
});

afterEach(async () => {
  await deleteTestCustomer(env.DB, customer.customerId);
});

describe('CLI license API', () => {
  it('returns bounded team members for an active team license key', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      licensedGet('/api/license/members', customer.licenseKey),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const members = Schema.decodeUnknownSync(Schema.Array(TeamMemberSchema))(await response.json());
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      machine_id: 'machine-public-id',
      hostname: 'build-host',
      is_active: true,
    });
  });

  it('returns enterprise policies without database identifiers or values', async () => {
    await env.DB.prepare(`UPDATE licenses SET tier = 'enterprise' WHERE id = ?`)
      .bind(customer.licenseId)
      .run();
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      licensedGet('/api/license/policies', customer.licenseKey),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const policies = Schema.decodeUnknownSync(Schema.Array(PolicySchema))(await response.json());
    expect(policies).toEqual([{ scope: 'security', rule: 'require-signatures', enforced: true }]);
  });

  it('returns a bounded customer audit trail for a team license', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      licensedGet('/api/license/audit', customer.licenseKey),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const entries = Schema.decodeUnknownSync(Schema.Array(AuditEntrySchema))(await response.json());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'license.validated',
      resource_type: 'license',
    });
  });

  it('rejects an invalid license key before reading team data', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      licensedGet('/api/license/members', 'invalid-key'),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });
});
