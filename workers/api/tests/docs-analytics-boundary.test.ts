import '../src/cloudflare-test.d.ts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  createScheduledController,
} from 'cloudflare:test';
import worker from '../src/worker';
import {
  handleDocsAnalytics,
  refreshDocsAnalyticsAggregates,
} from '../src/handlers/docs-analytics';

const tables = [
  'docs_analytics_events',
  'docs_analytics_sessions',
  'docs_analytics_pageviews_daily',
  'docs_analytics_referrers_daily',
  'docs_analytics_utm_daily',
  'docs_analytics_interactions_daily',
  'docs_analytics_geo_daily',
];
afterEach(async () => {
  for (const table of tables) await env.DB.prepare(`DELETE FROM ${table}`).run();
});

function request(empty: boolean) {
  return new Request('https://example.test/api/docs/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: empty
        ? []
        : [
            {
              event_type: 'pageview',
              event_name: 'view',
              properties: { url: '/docs' },
              session_id: 'reader',
              timestamp: '2000-01-01T00:00:00Z',
            },
          ],
    }),
  });
}

describe('docs ingestion resource boundary', () => {
  it.each([true, false])('does not schedule aggregates for empty=%s', async empty => {
    const ctx = createExecutionContext();
    const queries: string[] = [];
    const prepare = env.DB.prepare;
    env.DB.prepare = function (sql: string) {
      queries.push(sql);
      return prepare.call(env.DB, sql);
    };
    try {
      const response = await handleDocsAnalytics(request(empty), env, ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      expect(queries.some(query => /GROUP BY/i.test(query))).toBe(false);
      if (empty) expect(queries).toHaveLength(0);
    } finally {
      env.DB.prepare = prepare;
    }
  });

  it('refreshes today and yesterday idempotently including late writes', async () => {
    const now = Date.UTC(2026, 8, 13, 0, 5);
    for (const [id, date, session, duration] of [
      ['one', '2026-09-12 23:59:00', 'a', 100],
      ['two', '2026-09-12 23:59:30', 'a', 300],
      ['three', '2026-09-13 00:01:00', 'b', 200],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO docs_analytics_events (id, event_type, event_name, properties, timestamp, session_id, duration_ms) VALUES (?, 'pageview', 'view', ?, ?, ?, ?)`
      )
        .bind(
          id,
          JSON.stringify({ url: '/docs', country: 'US', utm: { source: 'newsletter' } }),
          date,
          session,
          duration
        )
        .run();
    }
    await refreshDocsAnalyticsAggregates(env.DB, now);
    await env.DB.prepare(
      `INSERT INTO docs_analytics_events (id, event_type, event_name, properties, timestamp, session_id, duration_ms) VALUES ('late', 'pageview', 'view', ?, '2026-09-12 23:59:59', 'c', 200)`
    )
      .bind(JSON.stringify({ url: '/docs', country: 'US', utm: { source: 'newsletter' } }))
      .run();
    await refreshDocsAnalyticsAggregates(env.DB, now);
    const ctx = createExecutionContext();
    await worker.scheduled(
      createScheduledController({ scheduledTime: now, cron: '*/5 * * * *' }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const rows = await env.DB.prepare(
      'SELECT date, views, unique_sessions, avg_time_on_page_ms FROM docs_analytics_pageviews_daily ORDER BY date'
    ).all();
    expect(rows.results).toEqual([
      { date: '2026-09-12', views: 3, unique_sessions: 2, avg_time_on_page_ms: 200 },
      { date: '2026-09-13', views: 1, unique_sessions: 1, avg_time_on_page_ms: 200 },
    ]);
    expect(
      (
        await env.DB.prepare('SELECT COUNT(*) AS count FROM docs_analytics_utm_daily').first<{
          count: number;
        }>()
      )?.count
    ).toBe(2);
  });
});
