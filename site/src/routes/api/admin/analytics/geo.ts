import type { APIEvent } from '@solidjs/start/server';
import { sql, gte, desc } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { internalErrorResponse, storedDataErrorResponse } from '~/lib/api-error';
import {
  GeoCityRowSchema,
  GeoCountryRowSchema,
  GeoRegionRowSchema,
  GeoTimezoneRowSchema,
  GeoTotalsRowSchema,
  OsCountRowSchema,
  isInvalidD1Row,
  optionalD1RowValue,
  readD1RowArray,
  readOptionalD1Row,
} from '~/lib/contracts/d1-rows';

export async function GET(event: APIEvent) {
  try {
    const adminCheck = await requireAdmin(event);
    if (adminCheck instanceof Response) {
      return adminCheck;
    }

    const { db } = adminCheck;

    const url = new URL(event.request.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const countryLookup = await readD1RowArray(
      GeoCountryRowSchema,
      'Geo country rows have an invalid shape',
      await db
        .select({
          countryCode: schema.geoUsage.countryCode,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${schema.geoUsage.licenseId})`,
          totalSessions: sql<number>`COUNT(*)`,
        })
        .from(schema.geoUsage)
        .where(gte(schema.geoUsage.lastSeenAt, startDate))
        .groupBy(schema.geoUsage.countryCode)
        .orderBy(desc(sql`COUNT(DISTINCT ${schema.geoUsage.licenseId})`))
        .limit(limit)
        .offset(offset)
        .all()
    );
    const regionLookup = await readD1RowArray(
      GeoRegionRowSchema,
      'Geo region rows have an invalid shape',
      await db
        .select({
          countryCode: schema.geoUsage.countryCode,
          region: schema.geoUsage.region,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${schema.geoUsage.licenseId})`,
        })
        .from(schema.geoUsage)
        .where(
          sql`${schema.geoUsage.region} IS NOT NULL AND ${schema.geoUsage.lastSeenAt} >= ${startDate.getTime()}`
        )
        .groupBy(schema.geoUsage.countryCode, schema.geoUsage.region)
        .orderBy(desc(sql`COUNT(DISTINCT ${schema.geoUsage.licenseId})`))
        .limit(limit)
        .all()
    );
    const timezoneLookup = await readD1RowArray(
      GeoTimezoneRowSchema,
      'Geo timezone rows have an invalid shape',
      await db
        .select({
          timezone: schema.geoUsage.timezone,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${schema.geoUsage.licenseId})`,
        })
        .from(schema.geoUsage)
        .where(
          sql`${schema.geoUsage.timezone} IS NOT NULL AND ${schema.geoUsage.lastSeenAt} >= ${startDate.getTime()}`
        )
        .groupBy(schema.geoUsage.timezone)
        .orderBy(desc(sql`COUNT(DISTINCT ${schema.geoUsage.licenseId})`))
        .limit(limit)
        .all()
    );
    const cityLookup = await readD1RowArray(
      GeoCityRowSchema,
      'Geo city rows have an invalid shape',
      await db
        .select({
          countryCode: schema.geoUsage.countryCode,
          city: schema.geoUsage.city,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${schema.geoUsage.licenseId})`,
        })
        .from(schema.geoUsage)
        .where(
          sql`${schema.geoUsage.city} IS NOT NULL AND ${schema.geoUsage.lastSeenAt} >= ${startDate.getTime()}`
        )
        .groupBy(schema.geoUsage.countryCode, schema.geoUsage.city)
        .orderBy(desc(sql`COUNT(DISTINCT ${schema.geoUsage.licenseId})`))
        .limit(20)
        .all()
    );
    const totalStatsLookup = await readOptionalD1Row(
      GeoTotalsRowSchema,
      'Geo totals have an invalid shape',
      await db
        .select({
          totalCountries: sql<number>`COUNT(DISTINCT ${schema.geoUsage.countryCode})`,
          totalUsers: sql<number>`COUNT(DISTINCT ${schema.geoUsage.licenseId})`,
          totalRegions: sql<number>`COUNT(DISTINCT ${schema.geoUsage.countryCode} || '-' || COALESCE(${schema.geoUsage.region}, ''))`,
        })
        .from(schema.geoUsage)
        .where(gte(schema.geoUsage.lastSeenAt, startDate))
        .get()
    );
    const osLookup = await readD1RowArray(
      OsCountRowSchema,
      'OS count rows have an invalid shape',
      await db
        .select({
          os: schema.machine.os,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.machine)
        .where(gte(schema.machine.lastSeenAt, startDate))
        .groupBy(schema.machine.os)
        .orderBy(desc(sql`COUNT(*)`))
        .all()
    );
    if (
      countryLookup._tag === 'invalid' ||
      regionLookup._tag === 'invalid' ||
      timezoneLookup._tag === 'invalid' ||
      cityLookup._tag === 'invalid' ||
      isInvalidD1Row(totalStatsLookup) ||
      osLookup._tag === 'invalid'
    ) {
      return storedDataErrorResponse();
    }

    const totalStats = optionalD1RowValue(totalStatsLookup);
    const totalUsers =
      totalStats?.totalUsers && totalStats.totalUsers > 0 ? totalStats.totalUsers : 1;
    const countriesWithPercentage = countryLookup.value.map(c => ({
      countryCode: c.countryCode,
      uniqueUsers: c.uniqueUsers,
      totalSessions: c.totalSessions,
      percentage: Math.round((c.uniqueUsers / totalUsers) * 100 * 10) / 10,
    }));

    return new Response(
      JSON.stringify({
        countries: countriesWithPercentage,
        regions: regionLookup.value.map(r => ({
          countryCode: r.countryCode,
          region: r.region ?? null,
          uniqueUsers: r.uniqueUsers,
        })),
        cities: cityLookup.value.map(c => ({
          countryCode: c.countryCode,
          city: c.city ?? null,
          uniqueUsers: c.uniqueUsers,
        })),
        timezones: timezoneLookup.value.map(t => ({
          timezone: t.timezone ?? null,
          uniqueUsers: t.uniqueUsers,
        })),
        platforms: osLookup.value.map(o => ({
          os: o.os || 'unknown',
          count: o.count,
        })),
        summary: {
          totalCountries: totalStats?.totalCountries ?? 0,
          totalUsers: totalStats?.totalUsers ?? 0,
          totalRegions: totalStats?.totalRegions ?? 0,
          periodDays: days,
        },
        pagination: {
          limit,
          offset,
          total: totalStats?.totalCountries ?? 0,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[Admin Geo Analytics] Error:', error);
    return internalErrorResponse();
  }
}
