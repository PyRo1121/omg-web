import { reportError, reportInfo } from '../observability';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOCS ANALYTICS HANDLER - World-Class Web Telemetry
 * Handles batch analytics events from omg-docs.pages.dev
 * Stores raw events, updates aggregates, provides admin dashboard data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { type Env, jsonResponse, errorResponse } from '../api';
import { Effect, Exit } from 'effect';
import { decodeJsonBody } from '../body';
import { DocsAnalyticsBatchSchema } from '../contracts/http-bodies';
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

/**
 * POST /api/docs/analytics
 * Accept batch analytics events from docs site
 * Rate limited to 100 requests per minute per IP (prevents abuse)
 */
export async function handleDocsAnalytics(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // Rate limiting (100 requests/min per IP)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.API_RATE_LIMITER) {
      const { success } = await env.API_RATE_LIMITER.limit({ key: `docs_analytics:${ip}` });
      if (!success) {
        return errorResponse('Rate limit exceeded', 429);
      }
    }

    const decodedBody = await Effect.runPromiseExit(
      decodeJsonBody(request, DocsAnalyticsBatchSchema)
    );
    if (Exit.isFailure(decodedBody)) {
      return errorResponse('Invalid payload: events array required', 400);
    }
    const body = decodedBody.value;
    if (!body.events || !Array.isArray(body.events)) {
      return errorResponse('Invalid payload: events array required', 400);
    }

    // Limit batch size to prevent abuse (max 50 events per request)
    if (body.events.length > 50) {
      return errorResponse('Batch size exceeds limit (max 50 events)', 400);
    }

    // Extract geographic data from Cloudflare headers
    const country = request.headers.get('CF-IPCountry') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    // Process events in batch
    const eventIds: string[] = [];
    const statements: D1PreparedStatement[] = [];

    for (const event of body.events) {
      // Validate event structure
      if (
        !event.event_type ||
        !event.event_name ||
        !event.properties ||
        !event.timestamp ||
        !event.session_id
      ) {
        continue; // Skip malformed events
      }

      const eventId = crypto.randomUUID();
      eventIds.push(eventId);

      // Enrich properties with server-side data
      const enrichedProperties = {
        ...event.properties,
        country,
        user_agent: userAgent,
      };

      // Insert raw event
      statements.push(
        env.DB.prepare(
          `INSERT INTO docs_analytics_events (id, event_type, event_name, properties, timestamp, session_id, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        ).bind(
          eventId,
          event.event_type,
          event.event_name,
          JSON.stringify(enrichedProperties),
          event.timestamp,
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
             VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT(session_id) DO UPDATE SET
               last_seen_at = excluded.last_seen_at,
               page_count = page_count + 1,
               exit_page = excluded.exit_page,
               total_time_ms = total_time_ms + ?`
          ).bind(
            event.session_id,
            event.timestamp,
            event.timestamp,
            props.utm?.source || null,
            props.utm?.medium || null,
            props.utm?.campaign || null,
            props.referrer || null,
            props.url || null,
            props.url || null,
            event.duration_ms || 0
          )
        );
      }
    }

    // Execute all statements in batch (atomic transaction)
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    // Trigger async aggregation for the current day (fire-and-forget)
    // This updates daily rollups without blocking the response
    const today = new Date().toISOString().slice(0, 10);
    ctx.waitUntil(
      aggregateDocsAnalytics(env.DB, today).catch(error => {
        reportError('Docs analytics background aggregation failed:', error);
      })
    );

    return jsonResponse({
      success: true,
      processed: eventIds.length,
      message: `Successfully processed ${eventIds.length} analytics events`,
    });
  } catch (error: unknown) {
    reportError('Docs analytics error:', error);
    return errorResponse('Failed to process analytics events', 500);
  }
}

/**
 * GET /api/docs/analytics/dashboard
 * Return aggregated analytics for admin dashboard
 * Shows: pageviews, top pages, referrers, UTM campaigns, geo distribution
 */
export async function handleDocsAnalyticsDashboard(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    // Limit to 90 days max
    const limitDays = Math.min(days, 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - limitDays);
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

    const decodedPageviews = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsPageviewsRowSchema,
        'Docs analytics pageview row has an invalid shape',
        pageviewsResult.results
      )
    );
    const decodedTopPages = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsTopPageRowSchema,
        'Docs analytics top page row has an invalid shape',
        topPagesResult.results
      )
    );
    const decodedReferrers = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsReferrerRowSchema,
        'Docs analytics referrer row has an invalid shape',
        referrersResult.results
      )
    );
    const decodedUtm = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsUtmRowSchema,
        'Docs analytics UTM row has an invalid shape',
        utmResult.results
      )
    );
    const decodedGeo = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsGeoRowSchema,
        'Docs analytics geo row has an invalid shape',
        geoResult.results
      )
    );
    const decodedInteractions = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsInteractionRowSchema,
        'Docs analytics interaction row has an invalid shape',
        interactionsResult.results
      )
    );
    const decodedPerformance = await Effect.runPromiseExit(
      decodeExtraRowArray(
        DocsPerformanceRowSchema,
        'Docs analytics performance row has an invalid shape',
        performanceResult.results
      )
    );
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
        period_days: limitDays,
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
 * Aggregate docs analytics for a given date
 * Updates daily rollup tables from raw events
 * Runs asynchronously via ctx.waitUntil() to not block responses
 */
async function aggregateDocsAnalytics(db: D1Database, date: string): Promise<void> {
  try {
    // Aggregate pageviews
    await db
      .prepare(
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
           avg_time_on_page_ms = excluded.avg_time_on_page_ms`
      )
      .bind(date)
      .run();

    // Aggregate referrers
    await db
      .prepare(
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
           pageviews = excluded.pageviews`
      )
      .bind(date)
      .run();

    // Aggregate UTM campaigns
    await db
      .prepare(
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
           pageviews = excluded.pageviews`
      )
      .bind(date)
      .run();

    // Aggregate interactions
    await db
      .prepare(
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
           count = excluded.count`
      )
      .bind(date)
      .run();

    // Aggregate geographic data
    await db
      .prepare(
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
           pageviews = excluded.pageviews`
      )
      .bind(date)
      .run();

    reportInfo(`Successfully aggregated docs analytics for ${date}`);
  } catch (error: unknown) {
    reportError(`Failed to aggregate docs analytics for ${date}:`, error);
  }
}

/**
 * Cleanup old raw events (retention: 7 days)
 * Keeps aggregates forever, deletes raw events after 7 days
 * Run daily via cron trigger
 */
export async function cleanupDocsAnalytics(db: D1Database): Promise<void> {
  try {
    const retentionDays = 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString();

    // Delete old raw events
    const result = await db
      .prepare(`DELETE FROM docs_analytics_events WHERE created_at < ?`)
      .bind(cutoffDateStr)
      .run();

    reportInfo(`Cleaned up ${result.meta.changes} old docs analytics events`);

    // Clean up old sessions (>30 days)
    await db
      .prepare(
        `DELETE FROM docs_analytics_sessions WHERE first_seen_at < datetime('now', '-30 days')`
      )
      .run();
  } catch (error: unknown) {
    reportError('Docs analytics cleanup error:', error);
  }
}
