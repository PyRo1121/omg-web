import '../src/cloudflare-test.d.ts';
/**
 * Privacy API Tests (GDPR/CCPA Compliance)
 * Tests for:
 * - GET /api/privacy/status
 * - POST /api/privacy/export
 * - POST /api/privacy/delete
 * - POST /api/privacy/opt-out
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { Schema } from '@effect/schema';
import worker from '../src/worker';

const ErrorResponseSchema = Schema.Struct({ error: Schema.String });
const PrivacyUserStatusSchema = Schema.Struct({
  telemetry_opt_out: Schema.Boolean,
  email_on_file: Schema.Union(Schema.String, Schema.Null),
});
const PrivacyPolicyResponseSchema = Schema.Struct({
  privacy_policy_version: Schema.String,
  data_retention: Schema.Unknown,
  your_rights: Schema.Array(Schema.String),
  available_globally: Schema.Boolean,
  user_status: Schema.optional(Schema.Union(PrivacyUserStatusSchema, Schema.Null)),
});
const PrivacyExportResponseSchema = Schema.Struct({
  export_date: Schema.String,
  export_format_version: Schema.String,
  profile: Schema.Struct({
    email: Schema.Union(Schema.String, Schema.Null),
    company: Schema.Union(Schema.String, Schema.Null),
    tier: Schema.Union(Schema.String, Schema.Null),
  }),
  licenses: Schema.optional(Schema.Array(Schema.Unknown)),
  command_history: Schema.optional(Schema.Array(Schema.Unknown)),
  sessions: Schema.optional(Schema.Array(Schema.Unknown)),
  performance_summary: Schema.optional(Schema.Array(Schema.Unknown)),
  feature_usage: Schema.optional(Schema.Array(Schema.Unknown)),
});
const PrivacyDeletionResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  request_id: Schema.String,
  deleted: Schema.Unknown,
  retention_notice: Schema.String,
});
const PrivacyPreferenceResponseSchema = Schema.Struct({
  success: Schema.Boolean,
  telemetry_opt_out: Schema.Boolean,
  message: Schema.String,
});

async function decodeResponse<S extends Schema.Schema.AnyNoContext>(
  response: Response,
  schema: S
): Promise<Schema.Schema.Type<S>> {
  const decoded = Schema.decodeUnknownEither(schema)(await response.json());
  if (decoded._tag === 'Left') {
    throw new Error('Response body did not match the expected test contract');
  }
  return decoded.right;
}

describe('Privacy API', () => {
  // Test data
  const TEST_EMAIL = 'privacy-test@example.com';
  const TEST_LICENSE_SEED = 'fixture-value';
  const TEST_CUSTOMER_ID = 'privacy-customer-id';
  const TEST_LICENSE_ID = 'privacy-license-id';
  const TEST_MACHINE_ID = 'privacy-machine-123';
  const TEST_SESSION_TOKEN = 'privacy-session-token';
  const VICTIM_CUSTOMER_ID = 'privacy-victim-customer';
  const VICTIM_LICENSE_ID = 'privacy-victim-license';
  const VICTIM_LICENSE_KEY = 'privacy-victim-key';
  const VICTIM_EMAIL = 'privacy-victim@example.com';
  const VICTIM_MACHINE_ID = 'privacy-victim-machine';

  beforeEach(async () => {
    // Set up test customer and license with telemetry data
    await env.DB.prepare(
      `
      INSERT INTO customers (id, email, company, tier, telemetry_opt_out, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind(TEST_CUSTOMER_ID, TEST_EMAIL, 'Privacy Test Corp', 'pro', 0)
      .run();

    await env.DB.prepare(
      `
      INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind(TEST_LICENSE_ID, TEST_CUSTOMER_ID, TEST_LICENSE_SEED, 'pro', 'active', 3)
      .run();

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      'INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)'
    )
      .bind('privacy-session-id', TEST_CUSTOMER_ID, TEST_SESSION_TOKEN, expiresAt)
      .run();

    // Add some telemetry data
    await env.DB.prepare(
      `
      INSERT INTO command_event (id, license_id, machine_id, command, success, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind('cmd-1', TEST_LICENSE_ID, TEST_MACHINE_ID, 'search', 1)
      .run();

    await env.DB.prepare(
      `
      INSERT INTO session (id, license_id, machine_id, session_id, event_type, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind('sess-1', TEST_LICENSE_ID, TEST_MACHINE_ID, 'sess-123', 'start')
      .run();

    await env.DB.prepare(
      `
      INSERT INTO performance_metric (id, license_id, machine_id, metric_type, duration_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind('perf-1', TEST_LICENSE_ID, TEST_MACHINE_ID, 'search_latency', 10)
      .run();

    await env.DB.prepare(
      `
      INSERT INTO feature_usage (id, license_id, machine_id, feature, enabled, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind('feat-1', TEST_LICENSE_ID, TEST_MACHINE_ID, 'sbom', 1)
      .run();
  });

  afterEach(async () => {
    // Clean up all test data
    await env.DB.prepare('DELETE FROM command_event WHERE license_id IN (?, ?)')
      .bind(TEST_LICENSE_ID, VICTIM_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM session WHERE license_id = ?').bind(TEST_LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM performance_metric WHERE license_id = ?')
      .bind(TEST_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM feature_usage WHERE license_id = ?')
      .bind(TEST_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM audit_log WHERE resource_id = ?')
      .bind(TEST_CUSTOMER_ID)
      .run();
    await env.DB.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(TEST_CUSTOMER_ID).run();
    await env.DB.prepare('DELETE FROM licenses WHERE id IN (?, ?)')
      .bind(TEST_LICENSE_ID, VICTIM_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM customers WHERE id IN (?, ?)')
      .bind(TEST_CUSTOMER_ID, VICTIM_CUSTOMER_ID)
      .run();
  });

  describe('GET /api/privacy/status', () => {
    it('should return privacy policy without license key', async () => {
      const request = new Request('http://localhost/api/privacy/status', {
        method: 'GET',
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, PrivacyPolicyResponseSchema);

      expect(body).toHaveProperty('privacy_policy_version');
      expect(body).toHaveProperty('data_retention');
      expect(body).toHaveProperty('your_rights');
      expect(body).toHaveProperty('available_globally', true);
      expect(body.your_rights).toContain('Right to access (POST /api/privacy/export)');
      expect(body.your_rights).toContain('Right to deletion (POST /api/privacy/delete)');
      expect(body.your_rights).toContain('Right to opt-out (POST /api/privacy/opt-out)');
    });

    it('returns user status for an authenticated customer', async () => {
      const request = new Request('http://localhost/api/privacy/status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, PrivacyPolicyResponseSchema);

      expect(body).toHaveProperty('user_status');
      if (body.user_status === null || body.user_status === undefined) {
        throw new Error('Authenticated privacy status must include user status');
      }
      expect(body.user_status).toHaveProperty('telemetry_opt_out', false);
      expect(body.user_status.email_on_file).toContain('@example.com');
    });

    it('rejects an invalid session token', async () => {
      const request = new Request('http://localhost/api/privacy/status', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid-session-token' },
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = await decodeResponse(response, ErrorResponseSchema);
      expect(body.error).toBe('Invalid or expired session');
    });
  });

  describe('POST /api/privacy/export', () => {
    it('rejects unauthenticated export requests', async () => {
      const request = new Request('http://localhost/api/privacy/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Authorization required' });
    });

    it('exports the authenticated customer data without exposing it to caches', async () => {
      const request = new Request('http://localhost/api/privacy/export', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('omg-data-export-');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = await decodeResponse(response, PrivacyExportResponseSchema);

      // Verify export structure
      expect(body).toHaveProperty('export_date');
      expect(body).toHaveProperty('export_format_version', '2.0');
      expect(body).toHaveProperty('profile');
      expect(body).toHaveProperty('licenses');
      expect(body).toHaveProperty('command_history');
      expect(body).toHaveProperty('sessions');
      expect(body).toHaveProperty('performance_summary');
      expect(body).toHaveProperty('feature_usage');

      // Verify profile data
      expect(body.profile.email).toBe(TEST_EMAIL);
      expect(body.profile.company).toBe('Privacy Test Corp');
      expect(body.profile.tier).toBe('pro');

      // Verify telemetry data
      expect(body.command_history).toHaveLength(1);
      expect(body.sessions).toHaveLength(1);
    });

    it('derives export ownership from the session instead of caller selectors', async () => {
      const request = new Request('http://localhost/api/privacy/export', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'other-customer@example.com', license_key: 'other-key' }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, PrivacyExportResponseSchema);
      expect(body.profile.email).toBe(TEST_EMAIL);
    });

    it('does not require identity selectors in the request body', async () => {
      const request = new Request('http://localhost/api/privacy/export', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
    });

    it('should create audit log entry for export', async () => {
      const request = new Request('http://localhost/api/privacy/export', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      // Verify audit log entry
      const audit = await env.DB.prepare(
        'SELECT * FROM audit_log WHERE action = ? AND resource_id = ?'
      )
        .bind('data_export_request', TEST_CUSTOMER_ID)
        .first();

      expect(audit).toBeTruthy();
      expect(audit?.resource_type).toBe('customer');
    });
  });

  describe('POST /api/privacy/delete', () => {
    it('rejects unauthenticated deletion without mutating telemetry', async () => {
      const request = new Request('http://localhost/api/privacy/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, confirm: true }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Authorization required' });
      const command = await env.DB.prepare('SELECT id FROM command_event WHERE id = ?')
        .bind('cmd-1')
        .first();
      expect(command).toBeTruthy();
    });

    it('requires explicit confirmation from the authenticated customer', async () => {
      const request = new Request('http://localhost/api/privacy/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: false }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = await decodeResponse(response, ErrorResponseSchema);
      expect(body.error).toContain('Deletion must be confirmed');
    });

    it('deletes telemetry for every license owned by the authenticated customer', async () => {
      const request = new Request('http://localhost/api/privacy/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirm: true,
          reason: 'Testing data deletion',
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, PrivacyDeletionResponseSchema);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('request_id');
      expect(body).toHaveProperty('deleted');
      expect(body).toHaveProperty('retention_notice');

      // Verify telemetry data was deleted
      const commands = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM command_event WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(commands?.count).toBe(0);

      const sessions = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM session WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(sessions?.count).toBe(0);

      const perf = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM performance_metric WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(perf?.count).toBe(0);

      const features = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM feature_usage WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(features?.count).toBe(0);
    });

    it('cannot redirect deletion to another tenant with caller-supplied identifiers', async () => {
      await env.DB.prepare(
        `INSERT INTO customers (id, email, company, tier, telemetry_opt_out, created_at)
         VALUES (?, ?, 'Victim Corp', 'pro', 0, datetime('now'))`
      )
        .bind(VICTIM_CUSTOMER_ID, VICTIM_EMAIL)
        .run();
      await env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, created_at)
         VALUES (?, ?, ?, 'pro', 'active', 3, datetime('now'))`
      )
        .bind(VICTIM_LICENSE_ID, VICTIM_CUSTOMER_ID, VICTIM_LICENSE_KEY)
        .run();
      await env.DB.prepare(
        `INSERT INTO command_event (id, license_id, machine_id, command, success, timestamp)
         VALUES ('victim-command', ?, ?, 'search', 1, datetime('now'))`
      )
        .bind(VICTIM_LICENSE_ID, VICTIM_MACHINE_ID)
        .run();

      const request = new Request('http://localhost/api/privacy/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirm: true,
          email: VICTIM_EMAIL,
          license_key: VICTIM_LICENSE_KEY,
          machine_id: VICTIM_MACHINE_ID,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const victimCommand = await env.DB.prepare(
        'SELECT id FROM command_event WHERE id = ? AND license_id = ?'
      )
        .bind('victim-command', VICTIM_LICENSE_ID)
        .first();
      const victimLicense = await env.DB.prepare('SELECT status FROM licenses WHERE id = ?')
        .bind(VICTIM_LICENSE_ID)
        .first();
      expect(victimCommand).toBeTruthy();
      expect(victimLicense?.status).toBe('active');
    });

    it('creates an audit receipt in the same deletion transaction', async () => {
      const request = new Request('http://localhost/api/privacy/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirm: true,
          reason: 'GDPR request',
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      // Verify audit log entry
      const audit = await env.DB.prepare(
        'SELECT * FROM audit_log WHERE action = ? AND resource_id = ?'
      )
        .bind('data_deletion_request', TEST_CUSTOMER_ID)
        .first<{ resource_type: string | null; metadata: string | null }>();

      expect(audit).toBeTruthy();
      if (audit === null || audit.metadata === null) {
        throw new Error('Audit metadata must be stored as JSON text');
      }
      expect(audit.resource_type).toBe('customer');
      let parsed: unknown;
      try {
        parsed = JSON.parse(audit.metadata);
      } catch {
        throw new Error('Audit metadata must be valid JSON');
      }
      const details = Schema.decodeUnknownEither(Schema.Struct({ reason: Schema.String }))(parsed);
      if (details._tag !== 'Right') {
        throw new Error('Audit details must include a reason string');
      }
      expect(details.right.reason).toBe('GDPR request');
    });

    it('marks every authenticated customer license as deleted', async () => {
      const request = new Request('http://localhost/api/privacy/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: true }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      // Verify license status was updated to deleted_by_user
      const license = await env.DB.prepare('SELECT status FROM licenses WHERE id = ?')
        .bind(TEST_LICENSE_ID)
        .first();

      expect(license?.status).toBe('deleted_by_user');
    });
  });

  describe('POST /api/privacy/opt-out', () => {
    it('rejects unauthenticated preference changes without mutating policy', async () => {
      const request = new Request('http://localhost/api/privacy/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: TEST_LICENSE_SEED, opt_out: true }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Authorization required' });
      const customer = await env.DB.prepare('SELECT telemetry_opt_out FROM customers WHERE id = ?')
        .bind(TEST_CUSTOMER_ID)
        .first();
      expect(customer?.telemetry_opt_out).toBe(0);
    });

    it('opts the authenticated customer out of telemetry', async () => {
      const request = new Request('http://localhost/api/privacy/opt-out', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ opt_out: true }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, PrivacyPreferenceResponseSchema);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('telemetry_opt_out', true);
      expect(body.message).toContain('Telemetry disabled');

      // Verify opt-out flag was set in database
      const customer = await env.DB.prepare('SELECT telemetry_opt_out FROM customers WHERE id = ?')
        .bind(TEST_CUSTOMER_ID)
        .first();

      expect(customer?.telemetry_opt_out).toBe(1);
    });

    it('opts the authenticated customer back into telemetry', async () => {
      // First opt-out
      await env.DB.prepare('UPDATE customers SET telemetry_opt_out = 1 WHERE id = ?')
        .bind(TEST_CUSTOMER_ID)
        .run();

      // Then opt-in
      const request = new Request('http://localhost/api/privacy/opt-out', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ opt_out: false }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, PrivacyPreferenceResponseSchema);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('telemetry_opt_out', false);
      expect(body.message).toContain('Telemetry re-enabled');

      // Verify opt-out flag was unset
      const customer = await env.DB.prepare('SELECT telemetry_opt_out FROM customers WHERE id = ?')
        .bind(TEST_CUSTOMER_ID)
        .first();

      expect(customer?.telemetry_opt_out).toBe(0);
    });

    it('rejects a missing telemetry preference', async () => {
      const request = new Request('http://localhost/api/privacy/opt-out', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = await decodeResponse(response, ErrorResponseSchema);
      expect(body.error).toBe('Invalid JSON body');
    });

    it('rejects an invalid session without changing telemetry preference', async () => {
      const request = new Request('http://localhost/api/privacy/opt-out', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid-session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ opt_out: true }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = await decodeResponse(response, ErrorResponseSchema);
      expect(body.error).toBe('Invalid or expired session');
    });
  });
});
