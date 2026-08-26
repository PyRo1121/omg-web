import { reportError } from '../observability';
import { Effect, Exit } from 'effect';
import { type Env, jsonResponse, errorResponse, enforceRateLimit, rateLimitClientIp } from '../api';
import { validateContentLength } from './telemetry';
import { decodeJsonBody } from '../body';
import {
  TrackingBatchSchema,
  optionalStringField,
  type TrackingBatch,
} from '../contracts/http-bodies';
import {
  AnalyticsSaltRowSchema,
  CliGeoRowSchema,
  CountRowSchema,
  decodeExtraRowArray,
  isInvalidExtraRow,
  optionalRowValue,
  readOptionalExtraRow,
  DocsGeoRowSchema,
  SiteAnalyticsTotalsRowSchema,
  SiteDailyTrendRowSchema,
  SiteDeviceRowSchema,
  SiteGeoRowSchema,
  SiteReferrerRowSchema,
  SiteRealtimeCountryRowSchema,
  SiteRealtimePageRowSchema,
  SiteTopPageRowSchema,
} from '../contracts/d1-extras';

/** Clamp the `days` query parameter to a valid 1–90-day reporting window. */
export function parseReportingDays(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 30;
}

const MAX_EVENTS_PER_BATCH = 50;
/** Declared-body cap for marketing-site tracking batches. */
const MAX_TRACK_PAYLOAD_BYTES = 512 * 1024;
/** Domain mixed into the visitor HMAC so hashes are site-scoped. */
const VISITOR_HASH_DOMAIN = 'omg.latham.cloud';
/** Weight applied to CLI installs when blending engagement across surfaces. */
const CLI_ENGAGEMENT_WEIGHT = 10;
/** Persist semantic browser events through the legacy constrained D1 categories. */
const STORAGE_EVENT_TYPE = {
  pageview: 'pageview',
  cta_click: 'click',
  scroll_depth: 'performance',
  time_on_page: 'performance',
  web_vitals: 'performance',
  engagement: 'performance',
} as const satisfies Record<
  TrackingBatch['events'][number]['event_type'],
  'pageview' | 'click' | 'performance'
>;

/** Hard caps applied to client-supplied event strings before persistence (schema-independent). */
const MAX_EVENT_NAME_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 64;
const MAX_PATH_LENGTH = 256;

/**
 * Ingest a batch of marketing-site tracking events (POST /api/site/analytics/track).
 *
 * @param request - Incoming request carrying a tracking batch.
 * @param env - Worker bindings including D1 and the rate limiter.
 * @returns The processed count, or an error response.
 */
export async function handleTrackEvent(request: Request, env: Env): Promise<Response> {
  try {
    const contentLengthError = validateContentLength(request, MAX_TRACK_PAYLOAD_BYTES);
    if (contentLengthError) {
      return contentLengthError;
    }

    const ip = rateLimitClientIp(request);
    const limited = await enforceRateLimit(env.API_RATE_LIMITER, `site_analytics:${ip}`);
    if (limited !== null) {
      return limited;
    }

    const decodedBody = await Effect.runPromiseExit(decodeJsonBody(request, TrackingBatchSchema));
    if (Exit.isFailure(decodedBody)) {
      return errorResponse('Invalid payload', 400);
    }
    const events = decodedBody.value.events;
    if (events.length > MAX_EVENTS_PER_BATCH) {
      return errorResponse('Invalid payload', 400);
    }
    // The shared body contract does not bound these strings; clamp here so a
    // crafted batch cannot persist oversized keys into D1 rows.
    const boundedEvents = events.map(event => ({
      ...event,
      event_type: STORAGE_EVENT_TYPE[event.event_type],
      event_name: event.event_name.slice(0, MAX_EVENT_NAME_LENGTH),
      session_id: event.session_id.slice(0, MAX_SESSION_ID_LENGTH),
    }));

    const userAgent = request.headers.get('User-Agent') || '';
    let device = 'desktop';
    let browser = 'Unknown';
    let os = 'Unknown';
    if (/mobile|android|iphone|ipad/i.test(userAgent)) {
      device = /ipad|tablet/i.test(userAgent) ? 'tablet' : 'mobile';
    }
    if (/chrome/i.test(userAgent) && !/edge|edg/i.test(userAgent)) {
      browser = 'Chrome';
    } else if (/firefox/i.test(userAgent)) {
      browser = 'Firefox';
    } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
      browser = 'Safari';
    } else if (/edge|edg/i.test(userAgent)) {
      browser = 'Edge';
    }
    if (/windows/i.test(userAgent)) {
      os = 'Windows';
    } else if (/mac os/i.test(userAgent)) {
      os = 'macOS';
    } else if (/linux/i.test(userAgent)) {
      os = 'Linux';
    } else if (/android/i.test(userAgent)) {
      os = 'Android';
    } else if (/ios|iphone|ipad/i.test(userAgent)) {
      os = 'iOS';
    }

    const now = Date.now();
    const dayStart = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate()
    );
    // One atomic conditional insert establishes a single salt for the UTC day.
    // D1 serializes writes, so concurrent cold starts either create the row or
    // observe the winner instead of fragmenting visitor identity.
    const insertedSalt = await env.DB.prepare(
      `INSERT INTO analytics_salts (salt, inserted_at)
       SELECT randomblob(16), ?
       WHERE NOT EXISTS (SELECT 1 FROM analytics_salts WHERE inserted_at >= ?)
       RETURNING salt`
    )
      .bind(now, dayStart)
      .first();
    const saltResult =
      insertedSalt ??
      (await env.DB.prepare(
        `SELECT salt FROM analytics_salts WHERE inserted_at >= ? ORDER BY inserted_at ASC LIMIT 1`
      )
        .bind(dayStart)
        .first());
    const saltLookup = await readOptionalExtraRow(
      AnalyticsSaltRowSchema,
      'Analytics salt row has an invalid shape',
      saltResult
    );
    if (saltLookup._tag !== 'present') {
      reportError('Analytics salt row has an invalid shape');
      return errorResponse('Failed to process events', 500);
    }
    const salt = saltLookup.value.salt;

    const visitorKey = await crypto.subtle.importKey(
      'raw',
      salt,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const visitorHash = await crypto.subtle.sign(
      'HMAC',
      visitorKey,
      new TextEncoder().encode(`${userAgent}${ip}${VISITOR_HASH_DOMAIN}`)
    );
    const visitorId =
      'v_' +
      Array.from(new Uint8Array(visitorHash).slice(0, 8))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    const country = request.headers.get('CF-IPCountry') || 'XX';
    const city = request.headers.get('CF-City') || 'Unknown';
    const statements = boundedEvents.flatMap(event => {
      const properties = event.properties || {};
      const referrer = optionalStringField(properties['referrer']);
      let referrerDomain = 'direct';
      if (referrer) {
        try {
          referrerDomain = new URL(referrer).hostname.replace(/^www\./, '');
        } catch {
          // Invalid referrers are grouped with direct traffic.
        }
      }

      const eventStatements = [
        env.DB.prepare(
          `INSERT INTO site_analytics_events
           (id, event_type, event_name, properties, timestamp, session_id, visitor_id, country_code, city, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          event.event_type,
          event.event_name,
          JSON.stringify({
            ...properties,
            device,
            browser,
            os,
            referrer_domain: referrerDomain,
          }),
          event.timestamp || now,
          event.session_id,
          visitorId,
          country,
          city,
          event.duration_ms || null,
          now
        ),
        env.DB.prepare(
          `INSERT INTO site_analytics_realtime (visitor_id, session_id, page_path, country_code, city, referrer, last_seen_at, page_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(visitor_id) DO UPDATE SET
             session_id = excluded.session_id,
             page_path = excluded.page_path,
             last_seen_at = excluded.last_seen_at,
             page_count = page_count + 1`
        ).bind(
          visitorId,
          event.session_id,
          (optionalStringField(properties['path']) ?? '/').slice(0, MAX_PATH_LENGTH),
          country,
          city,
          referrerDomain,
          now
        ),
      ];

      return eventStatements;
    });
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return jsonResponse({ success: true, processed: events.length });
  } catch (error: unknown) {
    reportError('Site analytics error:', error);
    return errorResponse('Failed to process events', 500);
  }
}

/**
 * Return blended site/docs/CLI geo engagement for the admin dashboard.
 *
 * @param request - Incoming request whose `days` query bounds the window.
 * @param env - Worker bindings including D1.
 * @returns Per-country engagement ranking over the reporting window.
 */
export async function handleGetGeoAnalytics(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = parseReportingDays(url.searchParams.get('days'));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const [siteGeo, docsGeo, cliGeo] = await Promise.all([
      env.DB.prepare(
        `SELECT country_code,
                COUNT(DISTINCT visitor_id) as visitors,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(*) as pageviews
         FROM site_analytics_events
         WHERE event_type = 'pageview'
           AND date(created_at / 1000, 'unixepoch') >= ?
         GROUP BY country_code
         ORDER BY visitors DESC`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT country_code, SUM(sessions) as sessions, SUM(pageviews) as pageviews
         FROM docs_analytics_geo_daily
         WHERE date >= ?
         GROUP BY country_code
         ORDER BY sessions DESC`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT json_extract(metadata, '$.country') as country_code, COUNT(*) as count
         FROM audit_log
         WHERE action = 'machine.registered' 
           AND created_at >= datetime('now', '-' || ? || ' days')
           AND json_extract(metadata, '$.country') IS NOT NULL
         GROUP BY json_extract(metadata, '$.country')
         ORDER BY count DESC`
      )
        .bind(days)
        .all(),
    ]);

    const [decodedSite, decodedDocs, decodedCli] = await Promise.all([
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteGeoRowSchema,
          'Site geo analytics row has an invalid shape',
          siteGeo.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          DocsGeoRowSchema,
          'Docs geo analytics row has an invalid shape',
          docsGeo.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          CliGeoRowSchema,
          'CLI geo analytics row has an invalid shape',
          cliGeo.results
        )
      ),
    ]);
    if (Exit.isFailure(decodedSite) || Exit.isFailure(decodedDocs) || Exit.isFailure(decodedCli)) {
      return errorResponse('Failed to load geo analytics', 500);
    }
    const siteRows = decodedSite.value;
    const docsRows = decodedDocs.value;
    const cliRows = decodedCli.value;
    const combined = new Map<
      string,
      {
        country_code: string;
        site_visitors: number;
        docs_sessions: number;
        cli_installs: number;
        total_engagement: number;
      }
    >();
    const getCountry = (countryCode: string) => {
      const existing = combined.get(countryCode);
      if (existing) {
        return existing;
      }
      const country = {
        country_code: countryCode,
        site_visitors: 0,
        docs_sessions: 0,
        cli_installs: 0,
        total_engagement: 0,
      };
      combined.set(countryCode, country);
      return country;
    };

    for (const row of siteRows) {
      const country = getCountry(row.country_code);
      country.site_visitors = row.visitors;
      country.total_engagement = row.visitors + row.sessions;
    }
    for (const row of docsRows) {
      const country = getCountry(row.country_code);
      country.docs_sessions = row.sessions;
      country.total_engagement += row.sessions;
    }
    for (const row of cliRows) {
      const country = getCountry(row.country_code);
      country.cli_installs = row.count;
      country.total_engagement += row.count * CLI_ENGAGEMENT_WEIGHT;
    }

    const sortedGeo = Array.from(combined.values())
      .toSorted((a, b) => b.total_engagement - a.total_engagement)
      .slice(0, 50);

    const totalEngagement = sortedGeo.reduce((sum, g) => sum + g.total_engagement, 0);

    const geoForDashboard = sortedGeo.map(g => ({
      country_code: g.country_code,
      user_count: g.total_engagement,
      percentage: totalEngagement > 0 ? (g.total_engagement / totalEngagement) * 100 : 0,
      breakdown: {
        site_visitors: g.site_visitors,
        docs_sessions: g.docs_sessions,
        cli_installs: g.cli_installs,
      },
    }));

    return jsonResponse({
      period_days: days,
      total_countries: combined.size,
      total_engagement: totalEngagement,
      geo_distribution: geoForDashboard,
      by_source: {
        site: siteRows.length,
        docs: docsRows.length,
        cli: cliRows.length,
      },
    });
  } catch (error: unknown) {
    reportError('Geo analytics error:', error);
    return errorResponse('Failed to load geo analytics', 500);
  }
}

/**
 * Return the realtime analytics snapshot for the admin dashboard.
 *
 * @param _request - Unused; the endpoint takes no parameters.
 * @param env - Worker bindings including D1.
 * @returns Active visitors, per-country counts, and top pages.
 */
export async function handleGetRealtimeAnalytics(_request: Request, env: Env): Promise<Response> {
  try {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const [activeVisitors, byCountry, topPages] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(DISTINCT visitor_id) as count
         FROM site_analytics_realtime
         WHERE last_seen_at > ?`
      )
        .bind(fiveMinutesAgo)
        .first(),

      env.DB.prepare(
        `SELECT country_code, COUNT(DISTINCT visitor_id) as count
         FROM site_analytics_realtime
         WHERE last_seen_at > ?
         GROUP BY country_code
         ORDER BY count DESC
         LIMIT 10`
      )
        .bind(fiveMinutesAgo)
        .all(),

      env.DB.prepare(
        `SELECT page_path, COUNT(*) as count
         FROM site_analytics_realtime
         WHERE last_seen_at > ?
         GROUP BY page_path
         ORDER BY count DESC
         LIMIT 10`
      )
        .bind(fiveMinutesAgo)
        .all(),
    ]);

    const activeVisitorsLookup = await readOptionalExtraRow(
      CountRowSchema,
      'Realtime visitor count has an invalid shape',
      activeVisitors
    );
    if (isInvalidExtraRow(activeVisitorsLookup)) {
      return errorResponse('Failed to load realtime analytics', 500);
    }
    const activeVisitorsRow = optionalRowValue(activeVisitorsLookup);
    const [decodedCountries, decodedPages] = await Promise.all([
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteRealtimeCountryRowSchema,
          'Realtime country row has an invalid shape',
          byCountry.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteRealtimePageRowSchema,
          'Realtime page row has an invalid shape',
          topPages.results
        )
      ),
    ]);
    if (Exit.isFailure(decodedCountries) || Exit.isFailure(decodedPages)) {
      return errorResponse('Failed to load realtime analytics', 500);
    }

    return jsonResponse({
      active_visitors: activeVisitorsRow?.count || 0,
      by_country: decodedCountries.value,
      top_pages: decodedPages.value,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    reportError('Realtime analytics error:', error);
    return errorResponse('Failed to load realtime analytics', 500);
  }
}

/**
 * Return aggregated site analytics for the admin dashboard.
 *
 * @param request - Incoming request whose `days` query bounds the window.
 * @param env - Worker bindings including D1.
 * @returns Totals, daily trend, top pages/referrers, and devices.
 */
export async function handleGetAnalyticsOverview(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = parseReportingDays(url.searchParams.get('days'));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const [totalStats, dailyTrend, topPages, topReferrers, deviceBreakdown] = await Promise.all([
      env.DB.prepare(
        `SELECT
           COUNT(*) as total_pageviews,
           COUNT(DISTINCT visitor_id) as total_visitors,
           COUNT(DISTINCT session_id) as total_sessions
         FROM site_analytics_events
         WHERE event_type = 'pageview'
           AND date(created_at / 1000, 'unixepoch') >= ?`
      )
        .bind(startDateStr)
        .first(),

      env.DB.prepare(
        `SELECT date(created_at / 1000, 'unixepoch') as date,
                COUNT(*) as pageviews,
                COUNT(DISTINCT visitor_id) as visitors
         FROM site_analytics_events
         WHERE event_type = 'pageview'
           AND date(created_at / 1000, 'unixepoch') >= ?
         GROUP BY date(created_at / 1000, 'unixepoch')
         ORDER BY date ASC`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT COALESCE(json_extract(properties, '$.path'), '/') as path,
                COUNT(*) as views,
                COUNT(DISTINCT visitor_id) as visitors
         FROM site_analytics_events
         WHERE event_type = 'pageview'
           AND date(created_at / 1000, 'unixepoch') >= ?
         GROUP BY path
         ORDER BY views DESC
         LIMIT 20`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT json_extract(properties, '$.referrer_domain') as referrer_domain,
                COUNT(DISTINCT visitor_id) as visitors,
                COUNT(*) as pageviews
         FROM site_analytics_events
         WHERE event_type = 'pageview'
           AND date(created_at / 1000, 'unixepoch') >= ?
           AND json_extract(properties, '$.referrer_domain') != 'direct'
         GROUP BY referrer_domain
         ORDER BY visitors DESC
         LIMIT 10`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT json_extract(properties, '$.device') as device_type,
                COUNT(DISTINCT visitor_id) as visitors
         FROM site_analytics_events
         WHERE event_type = 'pageview'
           AND date(created_at / 1000, 'unixepoch') >= ?
         GROUP BY device_type
         ORDER BY visitors DESC`
      )
        .bind(startDateStr)
        .all(),
    ]);

    const totalsLookup = await readOptionalExtraRow(
      SiteAnalyticsTotalsRowSchema,
      'Site analytics totals have an invalid shape',
      totalStats
    );
    if (isInvalidExtraRow(totalsLookup)) {
      return errorResponse('Failed to load site analytics', 500);
    }
    const totals = optionalRowValue(totalsLookup);
    const [decodedTrend, decodedPages, decodedReferrers, decodedDevices] = await Promise.all([
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteDailyTrendRowSchema,
          'Site daily trend row has an invalid shape',
          dailyTrend.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteTopPageRowSchema,
          'Site top page row has an invalid shape',
          topPages.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteReferrerRowSchema,
          'Site referrer row has an invalid shape',
          topReferrers.results
        )
      ),
      Effect.runPromiseExit(
        decodeExtraRowArray(
          SiteDeviceRowSchema,
          'Site device row has an invalid shape',
          deviceBreakdown.results
        )
      ),
    ]);
    if (
      Exit.isFailure(decodedTrend) ||
      Exit.isFailure(decodedPages) ||
      Exit.isFailure(decodedReferrers) ||
      Exit.isFailure(decodedDevices)
    ) {
      return errorResponse('Failed to load analytics overview', 500);
    }

    return jsonResponse({
      period_days: days,
      summary: {
        total_pageviews: totals?.total_pageviews || 0,
        total_visitors: totals?.total_visitors || 0,
        total_sessions: totals?.total_sessions || 0,
      },
      daily_trend: decodedTrend.value,
      top_pages: decodedPages.value,
      top_referrers: decodedReferrers.value,
      device_breakdown: decodedDevices.value,
    });
  } catch (error: unknown) {
    reportError('Analytics overview error:', error);
    return errorResponse('Failed to load analytics overview', 500);
  }
}
