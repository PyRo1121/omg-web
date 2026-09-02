import '../src/cloudflare-test.d.ts';
/**
 * Site analytics ingestion tests for POST /api/site/analytics/track.
 * These lock the batch validation and per-event persistence behavior.
 */

import * as Schema from 'effect/Schema';
import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchWorker } from './test-utils';
import { cleanupAnalyticsRetention } from '../src/handlers/docs-analytics';
import { handleGetAnalyticsOverview } from '../src/handlers/site-analytics';
import type { TrackingBatch } from '../src/contracts/http-bodies';

type TrackingEvent = TrackingBatch['events'][number];

const TRACK_URL = 'https://internal.test/api/site/analytics/track';

const StoredEventRowSchema = Schema.Struct({
  event_type: Schema.String,
  event_name: Schema.String,
  properties: Schema.String,
});

const StoredRealtimeRowSchema = Schema.Struct({
  page_path: Schema.String,
  page_count: Schema.Number,
});

const AnalyticsOverviewSchema = Schema.Struct({
  summary: Schema.Struct({
    total_pageviews: Schema.Number,
    total_visitors: Schema.Number,
    total_sessions: Schema.Number,
  }),
});

const ServerTimestampRowSchema = Schema.Struct({ timestamp: Schema.String });
const RetentionCountsSchema = Schema.Struct({
  activeUsers: Schema.Number,
  analyticsDaily: Schema.Number,
  analyticsErrors: Schema.Number,
  analyticsEvents: Schema.Number,
  memberUsage: Schema.Number,
  packageUsage: Schema.Number,
  rawUsage: Schema.Number,
  runtimeUsage: Schema.Number,
  usageDaily: Schema.Number,
});

const TrackedPropertiesSchema = Schema.Struct({
  device: Schema.String,
  browser: Schema.String,
  os: Schema.String,
  referrer_domain: Schema.String,
  path: Schema.String,
});

function trackRequest(payload: TrackingBatch): Request {
  return new Request(TRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function trackRawRequest(raw: string): Request {
  return new Request(TRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
}

async function track(payload: TrackingBatch): Promise<Response> {
  return fetchWorker(trackRequest(payload));
}

async function trackRaw(raw: string): Promise<Response> {
  return fetchWorker(trackRawRequest(raw));
}

function event(overrides: Partial<TrackingEvent> = {}): TrackingEvent {
  return {
    event_type: 'pageview',
    event_name: 'page_view',
    session_id: `session-${crypto.randomUUID()}`,
    properties: { path: '/pricing' },
    ...overrides,
  };
}

/**
 * Decode exactly one query result row, failing the test otherwise.
 *
 * @param schema - Row contract derived from the migration columns under test.
 * @param rows - Raw D1 result rows.
 * @returns The single decoded row.
 */
function decodeSingleRow<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  rows: ReadonlyArray<unknown>
): Schema.Schema.Type<S> {
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error('expected exactly one row');
  }
  return Schema.decodeUnknownSync(schema)(row);
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM site_analytics_events').run();
  await env.DB.prepare('DELETE FROM site_analytics_realtime').run();
  await env.DB.prepare('DELETE FROM site_analytics_geo_daily').run();
  await env.DB.prepare('DELETE FROM site_analytics_hourly').run();
  await env.DB.prepare('DELETE FROM docs_analytics_events').run();
  await env.DB.prepare('DELETE FROM docs_analytics_sessions').run();
  await env.DB.prepare(`DELETE FROM analytics_events WHERE id LIKE 'retention-%'`).run();
  await env.DB.prepare(`DELETE FROM analytics_errors WHERE error_message LIKE 'retention-%'`).run();
  await env.DB.prepare(
    `DELETE FROM analytics_active_users WHERE machine_id LIKE 'retention-%'`
  ).run();
  await env.DB.prepare(`DELETE FROM analytics_daily WHERE dimension LIKE 'retention-%'`).run();
  await env.DB.prepare(`DELETE FROM usage WHERE id LIKE 'retention-%'`).run();
  await env.DB.prepare(`DELETE FROM licenses WHERE id = 'retention-license'`).run();
  await env.DB.prepare(`DELETE FROM customers WHERE id = 'retention-customer'`).run();
});

describe('scheduled analytics retention', () => {
  it('keeps only telemetry and usage rows inside the disclosed windows', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers (id, email, tier) VALUES ('retention-customer', 'retention@example.com', 'pro')`
      ),
      env.DB.prepare(
        `INSERT INTO licenses (id, customer_id, license_key, tier, status)
         VALUES ('retention-license', 'retention-customer', 'retention-key', 'pro', 'active')`
      ),
      env.DB.prepare(
        `INSERT INTO analytics_events
         (id, event_type, event_name, timestamp, session_id, machine_id, license_key, version, platform, created_at)
         VALUES
           ('retention-event-old', 'command', 'old', datetime('now', '-13 months'), 'retention-session-old', 'retention-machine-old', 'retention-key', '1.0.0', 'linux', datetime('now', '-13 months')),
           ('retention-event-current', 'command', 'current', datetime('now', '-1 month'), 'retention-session-current', 'retention-machine-current', 'retention-key', '1.0.0', 'linux', datetime('now', '-1 month'))`
      ),
      env.DB.prepare(
        `INSERT INTO analytics_errors (error_message, occurrences, last_occurred_at)
         VALUES
           ('retention-error-old', 1, datetime('now', '-13 months')),
           ('retention-error-current', 1, datetime('now', '-1 month'))`
      ),
      env.DB.prepare(
        `INSERT INTO analytics_active_users (date, machine_id)
         VALUES
           (date('now', '-13 months'), 'retention-active-old'),
           (date('now', '-11 months'), 'retention-active-current')`
      ),
      env.DB.prepare(
        `INSERT INTO analytics_daily (date, metric, dimension, value)
         VALUES
           (date('now', '-13 months'), 'commands', 'retention-daily-old', 1),
           (date('now', '-11 months'), 'commands', 'retention-daily-current', 1)`
      ),
      env.DB.prepare(
        `INSERT INTO usage (id, license_key, feature, machine_id, timestamp)
         VALUES
           ('retention-raw-old', 'retention-key', 'search', 'retention-machine-old', datetime('now', '-13 months')),
           ('retention-raw-current', 'retention-key', 'search', 'retention-machine-current', datetime('now', '-11 months'))`
      ),
      env.DB.prepare(
        `INSERT INTO usage_daily (id, license_id, date, commands_run)
         VALUES
           ('retention-daily-old', 'retention-license', date('now', '-13 months'), 1),
           ('retention-daily-current', 'retention-license', date('now', '-11 months'), 1)`
      ),
      env.DB.prepare(
        `INSERT INTO usage_member_daily (id, license_id, machine_id, date, commands_run)
         VALUES
           ('retention-member-old', 'retention-license', 'retention-machine-old', date('now', '-13 months'), 1),
           ('retention-member-current', 'retention-license', 'retention-machine-current', date('now', '-11 months'), 1)`
      ),
      env.DB.prepare(
        `INSERT INTO usage_package_daily (license_id, date, package_name, usage_count)
         VALUES
           ('retention-license', date('now', '-13 months'), 'retention-package', 1),
           ('retention-license', date('now', '-11 months'), 'retention-package', 1)`
      ),
      env.DB.prepare(
        `INSERT INTO usage_runtime_daily (license_id, date, runtime, usage_count)
         VALUES
           ('retention-license', date('now', '-13 months'), 'retention-runtime', 1),
           ('retention-license', date('now', '-11 months'), 'retention-runtime', 1)`
      ),
    ]);

    await cleanupAnalyticsRetention(env.DB);

    const counts = Schema.decodeUnknownSync(RetentionCountsSchema)(
      await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM analytics_active_users WHERE machine_id LIKE 'retention-%') AS activeUsers,
           (SELECT COUNT(*) FROM analytics_daily WHERE dimension LIKE 'retention-%') AS analyticsDaily,
           (SELECT COUNT(*) FROM analytics_errors WHERE error_message LIKE 'retention-%') AS analyticsErrors,
           (SELECT COUNT(*) FROM analytics_events WHERE id LIKE 'retention-%') AS analyticsEvents,
           (SELECT COUNT(*) FROM usage_member_daily WHERE license_id = 'retention-license') AS memberUsage,
           (SELECT COUNT(*) FROM usage_package_daily WHERE license_id = 'retention-license') AS packageUsage,
           (SELECT COUNT(*) FROM usage WHERE id LIKE 'retention-%') AS rawUsage,
           (SELECT COUNT(*) FROM usage_runtime_daily WHERE license_id = 'retention-license') AS runtimeUsage,
           (SELECT COUNT(*) FROM usage_daily WHERE license_id = 'retention-license') AS usageDaily`
      ).first()
    );
    expect(counts).toEqual({
      activeUsers: 1,
      analyticsDaily: 1,
      analyticsErrors: 1,
      analyticsEvents: 1,
      memberUsage: 1,
      packageUsage: 1,
      rawUsage: 1,
      runtimeUsage: 1,
      usageDaily: 1,
    });
  });
});

describe('POST /api/docs/analytics', () => {
  it('uses server time as the canonical event and session timestamp', async () => {
    const response = await fetchWorker(
      new Request('https://internal.test/api/docs/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              event_type: 'pageview',
              event_name: 'page_view',
              properties: { url: '/docs/' },
              timestamp: '2000-01-01T00:00:00.000Z',
              session_id: 'docs-server-time-test',
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const eventRow = Schema.decodeUnknownSync(ServerTimestampRowSchema)(
      await env.DB.prepare(`SELECT timestamp FROM docs_analytics_events WHERE session_id = ?`)
        .bind('docs-server-time-test')
        .first()
    );
    expect(eventRow.timestamp).not.toBe('2000-01-01T00:00:00.000Z');
    expect(Date.parse(`${eventRow.timestamp.replace(' ', 'T')}Z`)).toBeGreaterThan(
      Date.now() - 60_000
    );
  });
});

describe('POST /api/site/analytics/track', () => {
  it('rejects an oversized properties object before persistence', async () => {
    const response = await track({
      events: [event({ properties: { path: '/pricing', detail: 'x'.repeat(4097) } })],
    });

    expect(response.status).toBe(400);
  });

  it('persists a valid pageview with enriched properties', async () => {
    const response = await track({ events: [event()] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, processed: 1 });

    const eventRows = await env.DB.prepare(
      'SELECT event_type, event_name, properties FROM site_analytics_events'
    ).all();
    const storedEvent = decodeSingleRow(StoredEventRowSchema, eventRows.results);
    expect(storedEvent.event_type).toBe('pageview');

    const props = Schema.decodeUnknownSync(TrackedPropertiesSchema)(
      JSON.parse(storedEvent.properties)
    );
    expect(props.device).toBe('desktop');
    expect(props.referrer_domain).toBe('direct');
    expect(props.path).toBe('/pricing');

    const realtimeRows = await env.DB.prepare(
      'SELECT page_path, page_count FROM site_analytics_realtime'
    ).all();
    const realtime = decodeSingleRow(StoredRealtimeRowSchema, realtimeRows.results);
    expect(realtime.page_path).toBe('/pricing');
    expect(realtime.page_count).toBe(1);
  });

  it('preserves the privacy-reduced referrer domain sent by the browser client', async () => {
    const response = await track({
      events: [event({ properties: { path: '/docs/', referrer: 'github.com' } })],
    });
    expect(response.status).toBe(200);

    const rows = await env.DB.prepare(
      'SELECT event_type, event_name, properties FROM site_analytics_events'
    ).all();
    const stored = decodeSingleRow(StoredEventRowSchema, rows.results);
    const properties = Schema.decodeUnknownSync(TrackedPropertiesSchema)(
      JSON.parse(stored.properties)
    );
    expect(properties.referrer_domain).toBe('github.com');
  });

  it('maps semantic CTA events to the constrained click storage category', async () => {
    const response = await track({
      events: [event({ event_type: 'cta_click', event_name: 'pricing_click' })],
    });
    expect(response.status).toBe(200);

    const rows = await env.DB.prepare(
      'SELECT event_type, event_name, properties FROM site_analytics_events'
    ).all();
    expect(decodeSingleRow(StoredEventRowSchema, rows.results).event_type).toBe('click');
  });

  it('upserts one realtime row per visitor across batches', async () => {
    const first = await track({ events: [event()] });
    const second = await track({ events: [event()] });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // The test requests share an IP and user agent, so they hash to one visitor.
    const realtimeRows = await env.DB.prepare(
      'SELECT page_path, page_count FROM site_analytics_realtime'
    ).all();
    const realtime = decodeSingleRow(StoredRealtimeRowSchema, realtimeRows.results);
    expect(realtime.page_count).toBe(2);
  });

  it('reports pageviews separately from distinct visitors and sessions', async () => {
    const sharedSession = 'shared-analytics-session';
    expect((await track({ events: [event({ session_id: sharedSession })] })).status).toBe(200);
    expect((await track({ events: [event({ session_id: sharedSession })] })).status).toBe(200);

    const response = await handleGetAnalyticsOverview(
      new Request('https://internal.test/api/site/analytics/overview?days=1'),
      env
    );

    expect(response.status).toBe(200);
    const payload = Schema.decodeUnknownSync(AnalyticsOverviewSchema)(await response.json());
    expect(payload.summary).toEqual({
      total_pageviews: 2,
      total_visitors: 1,
      total_sessions: 1,
    });
  });

  it('rejects malformed events inside a batch at the boundary', async () => {
    // Built as raw JSON because a real client can send shapes the schema rejects.
    const raw = JSON.stringify({
      events: [{ event_type: 'click', session_id: 'incomplete-event' }],
    });

    const response = await trackRaw(raw);
    expect(response.status).toBe(400);

    const stored = await env.DB.prepare('SELECT event_name FROM site_analytics_events').all();
    expect(stored.results).toHaveLength(0);
  });

  it('accepts an empty batch as a no-op success', async () => {
    const response = await track({ events: [] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, processed: 0 });

    const stored = await env.DB.prepare('SELECT event_name FROM site_analytics_events').all();
    expect(stored.results).toHaveLength(0);
  });

  it('rejects batches larger than 50 events', async () => {
    const response = await track({ events: Array.from({ length: 51 }, () => event()) });
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON bodies', async () => {
    const response = await trackRaw('{not-json');
    expect(response.status).toBe(400);
  });
});
