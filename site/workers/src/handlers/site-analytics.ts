import { reportError } from '../observability';
import { Effect, Exit } from 'effect';
import { type Env, jsonResponse, errorResponse, generateId } from '../api';
import { decodeJsonBody } from '../body';
import { TrackingBatchSchema, optionalStringField } from '../contracts/http-bodies';
import {
  AnalyticsSaltRowSchema,
  CliGeoRowSchema,
  CountRowSchema,
  decodeExtraRowArray,
  ExtraRowParseError,
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

interface ParsedUserAgent {
  device: string;
  browser: string;
  os: string;
}

async function getCurrentSalt(db: D1Database): Promise<Uint8Array> {
  const result = await db
    .prepare(
      `SELECT salt FROM analytics_salts 
     WHERE inserted_at > (unixepoch() * 1000 - 90000)
     ORDER BY inserted_at DESC LIMIT 1`
    )
    .first();

  const saltLookup = await readOptionalExtraRow(
    AnalyticsSaltRowSchema,
    'Analytics salt row has an invalid shape',
    result
  );
  if (saltLookup._tag === 'invalid') {
    throw new ExtraRowParseError('Analytics salt row has an invalid shape');
  }
  if (saltLookup._tag === 'present') {
    const saltRow = saltLookup.value;
    return saltRow.salt instanceof ArrayBuffer ? new Uint8Array(saltRow.salt) : saltRow.salt;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  await db
    .prepare(
      `INSERT INTO analytics_salts (salt, inserted_at) VALUES (x'${saltHex}', unixepoch() * 1000)`
    )
    .run();

  return salt;
}

async function generateVisitorId(
  request: Request,
  db: D1Database,
  domain: string
): Promise<string> {
  const salt = await getCurrentSalt(db);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';

  const data = new TextEncoder().encode(`${ua}${ip}${domain}`);
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const hash = await crypto.subtle.sign('HMAC', key, data);

  return (
    'v_' +
    Array.from(new Uint8Array(hash).slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

function parseUserAgent(ua: string): ParsedUserAgent {
  let device = 'desktop';
  let browser = 'Unknown';
  let os = 'Unknown';

  if (/mobile|android|iphone|ipad/i.test(ua)) {
    device = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
  }

  if (/chrome/i.test(ua) && !/edge|edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/firefox/i.test(ua)) {
    browser = 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/edge|edg/i.test(ua)) {
    browser = 'Edge';
  }

  if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/mac os/i.test(ua)) {
    os = 'macOS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/ios|iphone|ipad/i.test(ua)) {
    os = 'iOS';
  }

  return { device, browser, os };
}

function extractReferrerDomain(referrer: string | null): string {
  if (!referrer) {
    return 'direct';
  }
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'direct';
  }
}

export async function handleTrackEvent(request: Request, env: Env): Promise<Response> {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.API_RATE_LIMITER) {
      const { success } = await env.API_RATE_LIMITER.limit({ key: `site_analytics:${ip}` });
      if (!success) {
        return errorResponse('Rate limit exceeded', 429);
      }
    }

    const decodedBody = await Effect.runPromiseExit(decodeJsonBody(request, TrackingBatchSchema));
    if (Exit.isFailure(decodedBody)) {
      return errorResponse('Invalid payload', 400);
    }
    const body = decodedBody.value;
    if (!body.events || !Array.isArray(body.events) || body.events.length > 50) {
      return errorResponse('Invalid payload', 400);
    }

    const country = request.headers.get('CF-IPCountry') || 'XX';
    const city = request.headers.get('CF-City') || 'Unknown';
    const userAgent = request.headers.get('User-Agent') || '';
    const visitorId = await generateVisitorId(request, env.DB, 'pyro1121.com');
    const { device, browser, os } = parseUserAgent(userAgent);

    const statements: D1PreparedStatement[] = [];
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getUTCHours();

    for (const event of body.events) {
      if (!event.event_type || !event.event_name || !event.session_id) {
        continue;
      }

      const eventId = generateId();
      const props = event.properties || {};
      const referrerDomain = extractReferrerDomain(optionalStringField(props.referrer) ?? null);

      statements.push(
        env.DB.prepare(
          `INSERT INTO site_analytics_events 
           (id, event_type, event_name, properties, timestamp, session_id, visitor_id, country_code, city, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          eventId,
          event.event_type,
          event.event_name,
          JSON.stringify({ ...props, device, browser, os, referrer_domain: referrerDomain }),
          event.timestamp || now,
          event.session_id,
          visitorId,
          country,
          city,
          event.duration_ms || null,
          now
        )
      );

      statements.push(
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
          optionalStringField(props.path) ?? '/',
          country,
          city,
          referrerDomain,
          now
        )
      );

      if (event.event_type === 'pageview') {
        statements.push(
          env.DB.prepare(
            `INSERT INTO site_analytics_geo_daily (date, country_code, city, visitors, sessions, pageviews)
             VALUES (?, ?, ?, 1, 1, 1)
             ON CONFLICT(date, country_code, city) DO UPDATE SET
               pageviews = pageviews + 1,
               sessions = sessions + (CASE WHEN excluded.visitors = 1 THEN 1 ELSE 0 END)`
          ).bind(today, country, city)
        );

        statements.push(
          env.DB.prepare(
            `INSERT INTO site_analytics_hourly (date, hour, visitors, sessions, pageviews)
             VALUES (?, ?, 1, 1, 1)
             ON CONFLICT(date, hour) DO UPDATE SET pageviews = pageviews + 1`
          ).bind(today, hour)
        );
      }
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return jsonResponse({ success: true, processed: body.events.length });
  } catch (error: unknown) {
    reportError('Site analytics error:', error);
    return errorResponse('Failed to process events', 500);
  }
}

export async function handleGetGeoAnalytics(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const [siteGeo, docsGeo, cliGeo] = await Promise.all([
      env.DB.prepare(
        `SELECT country_code, SUM(visitors) as visitors, SUM(sessions) as sessions, SUM(pageviews) as pageviews
         FROM site_analytics_geo_daily
         WHERE date >= ?
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
           AND created_at >= datetime('now', '-${days} days')
           AND json_extract(metadata, '$.country') IS NOT NULL
         GROUP BY json_extract(metadata, '$.country')
         ORDER BY count DESC`
      ).all(),
    ]);

    const combined = new Map<
      string,
      {
        country_code: string;
        site_visitors: number;
        site_sessions: number;
        site_pageviews: number;
        docs_sessions: number;
        docs_pageviews: number;
        cli_installs: number;
        total_engagement: number;
      }
    >();

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

    for (const row of siteRows) {
      combined.set(row.country_code, {
        country_code: row.country_code,
        site_visitors: row.visitors,
        site_sessions: row.sessions,
        site_pageviews: row.pageviews,
        docs_sessions: 0,
        docs_pageviews: 0,
        cli_installs: 0,
        total_engagement: row.visitors + row.sessions,
      });
    }

    for (const row of docsRows) {
      const existing = combined.get(row.country_code);
      if (existing) {
        existing.docs_sessions = row.sessions;
        existing.docs_pageviews = row.pageviews;
        existing.total_engagement += row.sessions;
      } else {
        combined.set(row.country_code, {
          country_code: row.country_code,
          site_visitors: 0,
          site_sessions: 0,
          site_pageviews: 0,
          docs_sessions: row.sessions,
          docs_pageviews: row.pageviews,
          cli_installs: 0,
          total_engagement: row.sessions,
        });
      }
    }

    for (const row of cliRows) {
      const existing = combined.get(row.country_code);
      if (existing) {
        existing.cli_installs = row.count;
        existing.total_engagement += row.count * 10;
      } else {
        combined.set(row.country_code, {
          country_code: row.country_code,
          site_visitors: 0,
          site_sessions: 0,
          site_pageviews: 0,
          docs_sessions: 0,
          docs_pageviews: 0,
          cli_installs: row.count,
          total_engagement: row.count * 10,
        });
      }
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

export async function handleGetAnalyticsOverview(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const [totalStats, dailyTrend, topPages, topReferrers, deviceBreakdown] = await Promise.all([
      env.DB.prepare(
        `SELECT 
           SUM(pageviews) as total_pageviews,
           SUM(visitors) as total_visitors,
           SUM(sessions) as total_sessions
         FROM site_analytics_geo_daily
         WHERE date >= ?`
      )
        .bind(startDateStr)
        .first(),

      env.DB.prepare(
        `SELECT date, SUM(pageviews) as pageviews, SUM(visitors) as visitors
         FROM site_analytics_geo_daily
         WHERE date >= ?
         GROUP BY date
         ORDER BY date ASC`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT path, SUM(views) as views, SUM(unique_visitors) as visitors
         FROM site_analytics_pageviews_daily
         WHERE date >= ?
         GROUP BY path
         ORDER BY views DESC
         LIMIT 20`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT referrer_domain, SUM(visitors) as visitors, SUM(pageviews) as pageviews
         FROM site_analytics_referrers_daily
         WHERE date >= ? AND referrer_domain != 'direct'
         GROUP BY referrer_domain
         ORDER BY visitors DESC
         LIMIT 10`
      )
        .bind(startDateStr)
        .all(),

      env.DB.prepare(
        `SELECT device_type, SUM(visitors) as visitors
         FROM site_analytics_devices_daily
         WHERE date >= ?
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

export async function cleanupOldAnalytics(db: D1Database): Promise<void> {
  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    await db.batch([
      db.prepare(`DELETE FROM site_analytics_events WHERE created_at < ?`).bind(sevenDaysAgo),
      db.prepare(`DELETE FROM analytics_salts WHERE inserted_at < ?`).bind(fortyEightHoursAgo),
      db.prepare(`DELETE FROM site_analytics_realtime WHERE last_seen_at < ?`).bind(fiveMinutesAgo),
    ]);
  } catch (error: unknown) {
    reportError('Cleanup error:', error);
  }
}
