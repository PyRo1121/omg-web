import '../src/cloudflare-test.d.ts';
/**
 * Site analytics ingestion tests for POST /api/site/analytics/track.
 * These lock the batch validation and per-event persistence behavior.
 */

import * as Schema from 'effect/Schema';
import { describe, it, expect, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker';
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
  const ctx = createExecutionContext();
  const response = await worker.fetch(trackRequest(payload), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function trackRaw(raw: string): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(trackRawRequest(raw), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
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
});

describe('POST /api/docs/analytics', () => {
  it('uses server time as the canonical event and session timestamp', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
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
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);

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
