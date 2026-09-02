import { reportError, reportInfo } from '../observability';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOCS ANALYTICS HANDLER - World-Class Web Telemetry
 * Handles batch analytics events from omg-docs.pages.dev
 * Stores raw events, updates aggregates, provides admin dashboard data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { type Env, jsonResponse, errorResponse, enforceRateLimit, rateLimitClientIp } from '../api';
import { Effect, Exit } from 'effect';
import { decodeJsonBody } from '../body';
import { DocsAnalyticsBatchSchema } from '../contracts/http-bodies';
import { parseReportingDays } from './site-analytics';
import { validateContentLength } from './telemetry';
import {
  decodeExtraRowArray,
  DocsGeoRowSchema,
  DocsInteractionRowSchema,
  DocsPageviewsRowSchema,
  DocsPerformanceRowSchema,
  DocsReferrerRowSchema,
  DocsTopPageRowSchema,
  DocsUtmRowSchema,
} from '../contracts/d1-extras';

/** Maximum events accepted per ingest batch. */
const MAX_EVENTS_PER_BATCH = 50;
/** Declared-body cap for docs analytics batches. */
const MAX_DOCS_PAYLOAD_BYTES = 512 * 1024;
/** User agents are stored per event row; clamp header noise before persistence. */
const MAX_USER_AGENT_LENGTH = 256;
/** CLI telemetry retention promised by the privacy disclosures (privacy.ts). */
const TELEMETRY_RETENTION_DAYS = 90;
/** Aggregate and per-license usage retention promised by the privacy disclosures. */
const USAGE_RETENTION_MONTHS = 12;
/** Stale realtime rows past this age can never re-enter the 5-minute live window. */
const REALTIME_STALE_MS = 60 * 60 * 1000;

/**
 * Ingest a batch of docs-site analytics events (POST /api/docs/analytics).
 *
 * @param request - Incoming request carrying a docs analytics batch.
 * @param env - Worker bindings including D1 and the rate limiter.
 * @param ctx - Execution context used to defer aggregate refreshes.
 * @returns The processed count, or an error response.
 */
export async function handleDocsAnalytics(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // Request rate is bounded by the API_RATE_LIMITER binding configuration.
    const contentLengthError = validateContentLength(request, MAX_DOCS_PAYLOAD_BYTES);
    if (contentLengthError) {
      return contentLengthError;
    }

    const limited = await enforceRateLimit(
      env.API_RATE_LIMITER,
      `docs_analytics:${rateLimitClientIp(request)}`
    );
    if (limited !== null) {
      return limited;
    }

    const decodedBody = await Effect.runPromiseExit(
      decodeJsonBody(request, DocsAnalyticsBatchSchema)
    );
    if (Exit.isFailure(decodedBody)) {
      return errorResponse('Invalid payload: events array required', 400);
    }
    const body = decodedBody.value;
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return errorResponse(`Batch size exceeds limit (max ${MAX_EVENTS_PER_BATCH} events)`, 400);
    }

    // Extract geographic data from Cloudflare headers
    const country = request.headers.get('CF-IPCountry') || 'unknown';
    const userAgent = (request.headers.get('User-Agent') || 'unknown').slice(
      0,
      MAX_USER_AGENT_LENGTH
    );

    let processed = 0;
    const statements: D1PreparedStatement[] = [];

    for (const event of body.events) {
      if (!event.event_type || !event.event_name || !event.timestamp || !event.session_id) {
        continue;
      }

      const eventId = crypto.randomUUID();
      processed += 1;
      statements.push(
        env.DB.prepare(
          `INSERT INTO docs_analytics_events (id, event_type, event_name, properties, timestamp, session_id, duration_ms, created_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)`
        ).bind(
          eventId,
          event.event_type,
          event.event_name,
          JSON.stringify({ ...event.properties, country, user_agent: userAgent }),
          event.session_id,
          event.duration_ms || null
        )
      );

      // Update session tracking
      const props = event.properties;
      if (event.event_type === 'pageview') {
        statements.push(
          env.DB.prepare(
            `INSERT INTO docs_analytics_sessions (session_id, first_seen_at, last_seen_at, page_count, utm_source, utm_medium, utm_campaign, referrer, entry_page, exit_page, total_time_ms)
             VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, ?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT(session_id) DO UPDATE SET
               last_seen_at = excluded.last_seen_at,
               page_count = page_count + 1,
               exit_page = excluded.exit_page,
               total_time_ms = total_time_ms + ?`
          ).bind(
            event.session_id,
            props['utm']?.source || null,
            props['utm']?.medium || null,
            props['utm']?.campaign || null,
            props['referrer'] || null,
            props['url'] || null,
            props['url'] || null,
            event.duration_ms || 0
          )
        );
      }
    }

    // Execute all statements in batch (atomic transaction)
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    const today = new Date().toISOString().slice(0, 10);
    ctx.waitUntil(
      (async () => {
        try {
          for (const query of [
            `INSERT INTO docs_analytics_pageviews_daily (date, path, views, unique_sessions, avg_time_on_page_ms)
             SELECT
               DATE(timestamp) as date,
               JSON_EXTRACT(properties, '$.url') as path,
               COUNT(*) as views,
               COUNT(DISTINCT session_id) as unique_sessions,
               AVG(COALESCE(duration_ms, 0)) as avg_time_on_page_ms
             FROM docs_analytics_events
             WHERE event_type = 'pageview' AND DATE(timestamp) = ?
             GROUP BY date, path
             ON CONFLICT(date, path) DO UPDATE SET
               views = excluded.views,
               unique_sessions = excluded.unique_sessions,
               avg_time_on_page_ms = excluded.avg_time_on_page_ms`,
            `INSERT INTO docs_analytics_referrers_daily (date, referrer, sessions, pageviews)
             SELECT
               DATE(timestamp) as date,
               COALESCE(JSON_EXTRACT(properties, '$.referrer'), 'direct') as referrer,
               COUNT(DISTINCT session_id) as sessions,
               COUNT(*) as pageviews
             FROM docs_analytics_events
             WHERE event_type = 'pageview' AND DATE(timestamp) = ?
             GROUP BY date, referrer
             ON CONFLICT(date, referrer) DO UPDATE SET
               sessions = excluded.sessions,
               pageviews = excluded.pageviews`,
            `INSERT INTO docs_analytics_utm_daily (date, utm_source, utm_medium, utm_campaign, sessions, pageviews)
             SELECT
               DATE(timestamp) as date,
               JSON_EXTRACT(properties, '$.utm.source') as utm_source,
               JSON_EXTRACT(properties, '$.utm.medium') as utm_medium,
               JSON_EXTRACT(properties, '$.utm.campaign') as utm_campaign,
               COUNT(DISTINCT session_id) as sessions,
               COUNT(*) as pageviews
             FROM docs_analytics_events
             WHERE event_type = 'pageview'
               AND DATE(timestamp) = ?
               AND JSON_EXTRACT(properties, '$.utm.source') IS NOT NULL
             GROUP BY date, utm_source, utm_medium, utm_campaign
             ON CONFLICT(date, utm_source, utm_medium, utm_campaign) DO UPDATE SET
               sessions = excluded.sessions,
               pageviews = excluded.pageviews`,
            `INSERT INTO docs_analytics_interactions_daily (date, interaction_type, target, count)
             SELECT
               DATE(timestamp) as date,
               event_name as interaction_type,
               JSON_EXTRACT(properties, '$.target') as target,
               COUNT(*) as count
             FROM docs_analytics_events
             WHERE event_type = 'interaction' AND DATE(timestamp) = ?
             GROUP BY date, interaction_type, target
             ON CONFLICT(date, interaction_type, target) DO UPDATE SET
               count = excluded.count`,
            `INSERT INTO docs_analytics_geo_daily (date, country_code, sessions, pageviews)
             SELECT
               DATE(timestamp) as date,
               JSON_EXTRACT(properties, '$.country') as country_code,
               COUNT(DISTINCT session_id) as sessions,
               COUNT(*) as pageviews
             FROM docs_analytics_events
             WHERE event_type = 'pageview' AND DATE(timestamp) = ?
             GROUP BY date, country_code
             ON CONFLICT(date, country_code) DO UPDATE SET
               sessions = excluded.sessions,
               pageviews = excluded.pageviews`,
          ]) {
            await env.DB.prepare(query).bind(today).run();
          }
          reportInfo(`Successfully aggregated docs analytics for ${today}`);
        } catch (error: unknown) {
          reportError(`Failed to aggregate docs analytics for ${today}:`, error);
        }
      })()
    );

    return jsonResponse({
      success: true,
      processed,
      message: `Successfully processed ${processed} analytics events`,
    });
  } catch (error: unknown) {
    reportError('Docs analytics error:', error);
    return errorResponse('Failed to process analytics events', 500);
  }
}

/**
 * Return aggregated docs analytics for the admin dashboard.
 *
 * Shows pageviews, top pages, referrers, UTM campaigns, and geo distribution.
 *
 * @param request - Incoming request whose `days` query bounds the window.
 * @param env - Worker bindings including D1.
 * @returns Dashboard aggregates over the reporting window.
 */
export async function handleDocsAnalyticsDashboard(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = parseReportingDays(url.searchParams.get('days'));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    // Execute dashboard queries in parallel
    const [
      pageviewsResult,
      topPagesResult,
      referrersResult,
      utmResult,
      geoResult,
      interactionsResult,
      performanceResult,
    ] = await Promise.all([
      // Total pageviews over time
      env.DB.prepare(
        `SELECT date, SUM(views) as views, SUM(unique_sessions) as sessions
         FROM docs_analytics_pageviews_daily
         WHERE date >= ?
         GROUP BY date
         ORDER BY date DESC`
      )
        .bind(startDateStr)
        .all(),

      // Top pages
      env.DB.prepare(
        `SELECT path, SUM(views) as views, SUM(unique_sessions) as sessions, AVG(avg_time_on_page_ms) as avg_time
         FROM docs_analytics_pageviews_daily
         WHERE date >= ?
         GROUP BY path
         ORDER BY views DESC
         LIMIT 20`
      )
        .bind(startDateStr)
        .all(),

      // Top referrers
      env.DB.prepare(
        `SELECT referrer, SUM(sessions) as sessions, SUM(pageviews) as pageviews
         FROM docs_analytics_referrers_daily
         WHERE date >= ? AND referrer != 'direct'
         GROUP BY referrer
         ORDER BY sessions DESC
         LIMIT 10`
      )
        .bind(startDateStr)
        .all(),

      // UTM campaigns
      env.DB.prepare(
        `SELECT utm_source, utm_medium, utm_campaign, SUM(sessions) as sessions, SUM(pageviews) as pageviews
         FROM docs_analytics_utm_daily
         WHERE date >= ? AND utm_source IS NOT NULL
         GROUP BY utm_source, utm_medium, utm_campaign
         ORDER BY sessions DESC
         LIMIT 10`
      )
        .bind(startDateStr)
        .all(),

      // Geographic distribution
      env.DB.prepare(
        `SELECT country_code, SUM(sessions) as sessions, SUM(pageviews) as pageviews
         FROM docs_analytics_geo_daily
         WHERE date >= ?
         GROUP BY country_code
         ORDER BY sessions DESC
         LIMIT 20`
      )
        .bind(startDateStr)
        .all(),

      // Top interactions
      env.DB.prepare(
        `SELECT interaction_type, target, SUM(count) as count
         FROM docs_analytics_interactions_daily
         WHERE date >= ?
         GROUP BY interaction_type, target
         ORDER BY count DESC
         LIMIT 20`
      )
        .bind(startDateStr)
        .all(),

      // Performance metrics
      env.DB.prepare(
        `SELECT path, AVG(avg_load_time_ms) as avg_load, AVG(p95_load_time_ms) as p95_load, SUM(sample_count) as samples
         FROM docs_analytics_performance_daily
         WHERE date >= ?
         GROUP BY path
         ORDER BY samples DESC
         LIMIT 10`
      )
        .bind(startDateStr)
        .all(),
    ]);

    const [
      decodedPageviews,
      decodedTopPages,
      decodedReferrers,
      decodedUtm,
      decodedGeo,
      decodedInteractions,
      decodedPerformance,
    ] = await Promise.all([
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsPageviewsRowSchema,
          'Docs analytics pageview row has an invalid shape',
          pageviewsResult.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsTopPageRowSchema,
          'Docs analytics top page row has an invalid shape',
          topPagesResult.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsReferrerRowSchema,
          'Docs analytics referrer row has an invalid shape',
          referrersResult.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsUtmRowSchema,
          'Docs analytics UTM row has an invalid shape',
          utmResult.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsGeoRowSchema,
          'Docs analytics geo row has an invalid shape',
          geoResult.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsInteractionRowSchema,
          'Docs analytics interaction row has an invalid shape',
          interactionsResult.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsPerformanceRowSchema,
          'Docs analytics performance row has an invalid shape',
          performanceResult.results
        )
      ),
    ]);
    if (
      Exit.isFailure(decodedPageviews) ||
      Exit.isFailure(decodedTopPages) ||
      Exit.isFailure(decodedReferrers) ||
      Exit.isFailure(decodedUtm) ||
      Exit.isFailure(decodedGeo) ||
      Exit.isFailure(decodedInteractions) ||
      Exit.isFailure(decodedPerformance)
    ) {
      return errorResponse('Failed to load analytics dashboard', 500);
    }

    const totalPageviews = decodedPageviews.value.reduce((sum, row) => sum + row.views, 0);
    const totalSessions = decodedPageviews.value.reduce((sum, row) => sum + row.sessions, 0);

    return jsonResponse({
      summary: {
        total_pageviews: totalPageviews,
        total_sessions: totalSessions,
        avg_pages_per_session:
          totalSessions > 0 ? (totalPageviews / totalSessions).toFixed(2) : '0',
        period_days: days,
      },
      pageviews_over_time: decodedPageviews.value,
      top_pages: decodedTopPages.value,
      top_referrers: decodedReferrers.value,
      utm_campaigns: decodedUtm.value,
      geographic: decodedGeo.value,
      top_interactions: decodedInteractions.value,
      performance: decodedPerformance.value,
    });
  } catch (error: unknown) {
    reportError('Docs analytics dashboard error:', error);
    return errorResponse('Failed to load analytics dashboard', 500);
  }
}

/**
 * Daily retention cleanup invoked by the Worker's `scheduled` handler.
 *
 * Prunes expired raw docs analytics rows (7 days), docs sessions (30 days),
 * CLI telemetry rows at the retention promised by the privacy disclosures
 * (90 days), raw site analytics (90 days), usage statistics (12 months), rotated visitor salts,
 * and stale realtime presence rows.
 * This function owns all analytics retention because the scheduled handler
 * currently calls only this cleanup. Failures propagate to the caller so the
 * scheduled handler is the single failure path.
 *
 * @param db - The licensing D1 database.
 */
export async function cleanupAnalyticsRetention(db: D1Database): Promise<void> {
  // Compare in the same format CURRENT_TIMESTAMP writes (YYYY-MM-DD HH:MM:SS);
  // an ISO string cutoff deletes up to a day early due to ' ' vs 'T' ordering.
  await db
    .prepare(`DELETE FROM docs_analytics_events WHERE created_at < datetime('now', '-7 days')`)
    .run();
  reportInfo('Cleaned up old docs analytics events');

  await db
    .prepare(
      `DELETE FROM docs_analytics_sessions WHERE first_seen_at < datetime('now', '-30 days')`
    )
    .run();
  reportInfo('Cleaned up old docs analytics sessions');

  for (const table of ['command_event', 'session', 'performance_metric', 'feature_usage']) {
    await db
      .prepare(
        `DELETE FROM ${table} WHERE timestamp < datetime('now', '-${TELEMETRY_RETENTION_DAYS} days')`
      )
      .run();
    reportInfo(`Cleaned up expired ${table} rows`);
  }

  await db
    .prepare(
      `DELETE FROM analytics_events
       WHERE created_at < datetime('now', '-${TELEMETRY_RETENTION_DAYS} days')`
    )
    .run();
  await db
    .prepare(
      `DELETE FROM analytics_errors
       WHERE last_occurred_at < datetime('now', '-${TELEMETRY_RETENTION_DAYS} days')`
    )
    .run();
  reportInfo('Cleaned up expired CLI analytics rows');

  for (const table of ['analytics_active_users', 'analytics_daily']) {
    await db
      .prepare(`DELETE FROM ${table} WHERE date < date('now', '-${USAGE_RETENTION_MONTHS} months')`)
      .run();
  }
  await db
    .prepare(
      `DELETE FROM usage WHERE timestamp < datetime('now', '-${USAGE_RETENTION_MONTHS} months')`
    )
    .run();
  for (const table of [
    'usage_daily',
    'usage_member_daily',
    'usage_package_daily',
    'usage_runtime_daily',
  ]) {
    await db
      .prepare(`DELETE FROM ${table} WHERE date < date('now', '-${USAGE_RETENTION_MONTHS} months')`)
      .run();
  }
  reportInfo('Cleaned up expired usage statistics');

  await db
    .prepare(
      `DELETE FROM site_analytics_events
       WHERE created_at < (unixepoch() - ${TELEMETRY_RETENTION_DAYS * 24 * 60 * 60}) * 1000`
    )
    .run();
  reportInfo('Cleaned up expired site analytics rows');

  // Keep today's and yesterday's daily salts so the scheduled cleanup cannot
  // fragment visitor identity during the current UTC day.
  await db
    .prepare(`DELETE FROM analytics_salts WHERE inserted_at < (unixepoch() - 172800) * 1000`)
    .run();
  reportInfo('Cleaned up rotated analytics salts');

  await db
    .prepare(`DELETE FROM site_analytics_realtime WHERE last_seen_at < ?`)
    .bind(Date.now() - REALTIME_STALE_MS)
    .run();
  reportInfo('Cleaned up stale realtime analytics rows');
}
