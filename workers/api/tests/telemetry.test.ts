import '../src/cloudflare-test.d.ts';
/**
 * Telemetry API Tests
 * Tests for POST /api/cli/event and POST /api/cli/batch endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import * as Schema from 'effect/Schema';
import worker from '../src/worker';

const ErrorPayloadSchema = Schema.Struct({ error: Schema.String });
const EventSuccessPayloadSchema = Schema.Struct({
  success: Schema.Boolean,
  event_id: Schema.String,
});
const BatchPayloadSchema = Schema.Struct({
  success: Schema.optional(Schema.Boolean),
  processed: Schema.Number,
});
const ALLOW_ALL_RATE_LIMITER: NonNullable<(typeof env)['API_RATE_LIMITER']> = {
  limit: async () => ({ success: true }),
};

async function decodeResponse<S extends Schema.Schema.AnyNoContext>(
  response: Response,
  schema: S
): Promise<Schema.Schema.Type<S>> {
  return Schema.decodeUnknownSync(schema)(await response.json());
}

describe('Telemetry API', () => {
  // Test license key and customer setup
  const TEST_LICENSE_KEY = 'test-license-key-12345';
  const TEST_CUSTOMER_ID = 'test-customer-id';
  const TEST_LICENSE_ID = 'test-license-id';
  const TEST_MACHINE_ID = 'test-machine-abc123';

  beforeEach(async () => {
    env.API_RATE_LIMITER = ALLOW_ALL_RATE_LIMITER;
    // Set up test database with a customer and license
    await env.DB.prepare(
      `
      INSERT INTO customers (id, email, company, tier, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `
    )
      .bind(TEST_CUSTOMER_ID, 'test@example.com', 'Test Corp', 'pro')
      .run();

    await env.DB.prepare(
      `
      INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind(TEST_LICENSE_ID, TEST_CUSTOMER_ID, TEST_LICENSE_KEY, 'pro', 'active', 3)
      .run();
  });

  afterEach(async () => {
    // Clean up test data
    await env.DB.prepare('DELETE FROM command_event WHERE license_id = ?')
      .bind(TEST_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM session WHERE license_id = ?').bind(TEST_LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM performance_metric WHERE license_id = ?')
      .bind(TEST_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM feature_usage WHERE license_id = ?')
      .bind(TEST_LICENSE_ID)
      .run();
    await env.DB.prepare('DELETE FROM licenses WHERE id = ?').bind(TEST_LICENSE_ID).run();
    await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(TEST_CUSTOMER_ID).run();
  });

  describe('POST /api/cli/event - Single Event', () => {
    it('applies the IP limiter before parsing an untrusted body', async () => {
      env.API_RATE_LIMITER = { limit: async () => ({ success: false }) };
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request('http://localhost/api/cli/event', {
          method: 'POST',
          headers: {
            'CF-Connecting-IP': '192.0.2.10',
            'Content-Type': 'application/json',
          },
          body: '{invalid',
        }),
        env,
        ctx
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(429);
    });

    it('rejects negative telemetry counters at the boundary', async () => {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request('http://localhost/api/cli/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: { type: 'command', command: 'search', duration_ms: -1, success: true },
            timestamp: new Date().toISOString(),
            machine_id: TEST_MACHINE_ID,
            version: '0.1.0',
            platform: 'linux',
            license_key: TEST_LICENSE_KEY,
          }),
        }),
        env,
        ctx
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
    });

    it('should accept and store a valid command event', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'command',
            command: 'search',
            subcommand: null,
            packages: ['firefox'],
            duration_ms: 45,
            success: true,
            result_count: 10,
          },
          timestamp: '2000-01-01T00:00:00.000Z',
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: TEST_LICENSE_KEY,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, EventSuccessPayloadSchema);
      expect(body.success).toBe(true);
      expect(body.event_id.length).toBeGreaterThan(0);

      // Verify event was stored in database
      const stored = await env.DB.prepare('SELECT * FROM command_event WHERE license_id = ?')
        .bind(TEST_LICENSE_ID)
        .first();

      expect(stored).toBeTruthy();
      expect(stored?.command).toBe('search');
      expect(stored?.success).toBe(1);
      expect(stored?.duration_ms).toBe(45);
      expect(stored?.timestamp).not.toBe('2000-01-01T00:00:00.000Z');
      const storedAt = Date.parse(`${String(stored?.timestamp).replace(' ', 'T')}Z`);
      expect(storedAt).toBeGreaterThan(Date.now() - 60_000);
    });

    it('should store a session event', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'session',
            session_id: 'sess-123',
            event_type: 'start',
            start_time: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: TEST_LICENSE_KEY,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const stored = await env.DB.prepare('SELECT * FROM session WHERE license_id = ?')
        .bind(TEST_LICENSE_ID)
        .first();

      expect(stored).toBeTruthy();
      expect(stored?.session_id).toBe('sess-123');
      expect(stored?.event_type).toBe('start');
    });

    it('should store a performance metric event', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'performance',
            metric_type: 'search_latency',
            duration_ms: 8,
            context: 'nucleo_index',
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: TEST_LICENSE_KEY,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const stored = await env.DB.prepare('SELECT * FROM performance_metric WHERE license_id = ?')
        .bind(TEST_LICENSE_ID)
        .first();

      expect(stored).toBeTruthy();
      expect(stored?.metric_type).toBe('search_latency');
      expect(stored?.duration_ms).toBe(8);
    });

    it('should store a feature usage event', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'feature',
            feature: 'sbom_generation',
            enabled: true,
            metadata: { format: 'cyclonedx' },
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: TEST_LICENSE_KEY,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);

      const stored = await env.DB.prepare('SELECT * FROM feature_usage WHERE license_id = ?')
        .bind(TEST_LICENSE_ID)
        .first();

      expect(stored).toBeTruthy();
      expect(stored?.feature).toBe('sbom_generation');
      expect(stored?.enabled).toBe(1);
    });

    it('should return 400 for invalid JSON', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = await decodeResponse(response, ErrorPayloadSchema);
      expect(body.error).toContain('Invalid JSON body');
    });

    it('should return 401 when license_key is missing', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'command',
            command: 'search',
            success: true,
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          // license_key is missing
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = await decodeResponse(response, ErrorPayloadSchema);
      expect(body.error).toContain('License key required');
    });

    it('should return 401 when license_key is invalid', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'command',
            command: 'search',
            success: true,
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: 'invalid-key-xyz',
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = await decodeResponse(response, ErrorPayloadSchema);
      expect(body.error).toContain('Invalid license key');
    });

    it('should return 401 when license is inactive', async () => {
      await env.DB.prepare(`UPDATE licenses SET status = 'suspended' WHERE id = ?`)
        .bind(TEST_LICENSE_ID)
        .run();

      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'command',
            command: 'search',
            success: true,
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: TEST_LICENSE_KEY,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });

    it('should return 400 for malformed event (invalid type)', async () => {
      const request = new Request('http://localhost/api/cli/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            type: 'invalid_type',
            some_data: 'test',
          },
          timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
          version: '0.1.0',
          platform: 'linux',
          license_key: TEST_LICENSE_KEY,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = await decodeResponse(response, ErrorPayloadSchema);
      expect(body.error).toContain('Invalid event type');
    });
  });

  describe('POST /api/cli/batch - Batched Events', () => {
    it('should process a batch of mixed event types atomically', async () => {
      const request = new Request('http://localhost/api/cli/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              event: {
                type: 'command',
                command: 'search',
                success: true,
                duration_ms: 10,
              },
              timestamp: new Date().toISOString(),
              machine_id: TEST_MACHINE_ID,
              version: '0.1.0',
              platform: 'linux',
              license_key: TEST_LICENSE_KEY,
            },
            {
              event: {
                type: 'performance',
                metric_type: 'cache_hit',
                duration_ms: 2,
              },
              timestamp: new Date().toISOString(),
              machine_id: TEST_MACHINE_ID,
              version: '0.1.0',
              platform: 'linux',
              license_key: TEST_LICENSE_KEY,
            },
            {
              event: {
                type: 'feature',
                feature: 'runtime_switch',
                enabled: true,
              },
              timestamp: new Date().toISOString(),
              machine_id: TEST_MACHINE_ID,
              version: '0.1.0',
              platform: 'linux',
              license_key: TEST_LICENSE_KEY,
            },
          ],
          batch_timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, BatchPayloadSchema);
      expect(body.success).toBe(true);
      expect(body.processed).toBe(3);

      // Verify all events were stored
      const commands = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM command_event WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(commands?.count).toBe(1);

      const perf = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM performance_metric WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(perf?.count).toBe(1);

      const features = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM feature_usage WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(features?.count).toBe(1);
    });

    it('should return success with 0 processed for empty batch', async () => {
      const request = new Request('http://localhost/api/cli/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [],
          batch_timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, BatchPayloadSchema);
      expect(body.success).toBe(true);
      expect(body.processed).toBe(0);
    });

    it('should return 401 when license_key is missing from batch', async () => {
      const request = new Request('http://localhost/api/cli/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              event: {
                type: 'command',
                command: 'search',
                success: true,
              },
              timestamp: new Date().toISOString(),
              machine_id: TEST_MACHINE_ID,
              version: '0.1.0',
              platform: 'linux',
              // license_key is missing
            },
          ],
          batch_timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = await decodeResponse(response, ErrorPayloadSchema);
      expect(body.error).toContain('License key required');
    });

    it('should return 401 when license_key is invalid in batch', async () => {
      const request = new Request('http://localhost/api/cli/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              event: {
                type: 'command',
                command: 'search',
                success: true,
              },
              timestamp: new Date().toISOString(),
              machine_id: TEST_MACHINE_ID,
              version: '0.1.0',
              platform: 'linux',
              license_key: 'invalid-batch-key',
            },
          ],
          batch_timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = await decodeResponse(response, ErrorPayloadSchema);
      expect(body.error).toContain('Invalid license key');
    });

    it('should process large batches (100 events)', async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        event: {
          type: 'command',
          command: 'info',
          success: true,
          duration_ms: 5 + i,
        },
        timestamp: new Date().toISOString(),
        machine_id: TEST_MACHINE_ID,
        version: '0.1.0',
        platform: 'linux',
        license_key: TEST_LICENSE_KEY,
      }));

      const request = new Request('http://localhost/api/cli/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events,
          batch_timestamp: new Date().toISOString(),
          machine_id: TEST_MACHINE_ID,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await decodeResponse(response, BatchPayloadSchema);
      expect(body.processed).toBe(100);

      // Verify count
      const count = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM command_event WHERE license_id = ?'
      )
        .bind(TEST_LICENSE_ID)
        .first();
      expect(count?.count).toBe(100);
    });
  });
});
