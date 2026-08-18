import type { APIEvent } from '@solidjs/start/server';
import { sql, gte, desc } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  AdminCommandDistRowSchema,
  AdminCommandOverallRowSchema,
  AdminDailyTotalsRowSchema,
  CommandTrendRowSchema,
  CountRowSchema,
  PopularPackageRowSchema,
  RuntimeUsageRowSchema,
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split('T')[0];

    const commandDistributionLookup = await readD1RowArray(
      AdminCommandDistRowSchema,
      'Command distribution rows have an invalid shape',
      await db
        .select({
          command: schema.commandUsage.command,
          count: sql<number>`COUNT(*)`,
          successCount: sql<number>`SUM(CASE WHEN ${schema.commandUsage.success} = 1 THEN 1 ELSE 0 END)`,
          failureCount: sql<number>`SUM(CASE WHEN ${schema.commandUsage.success} = 0 THEN 1 ELSE 0 END)`,
          avgDurationMs: sql<number>`AVG(${schema.commandUsage.durationMs})`,
        })
        .from(schema.commandUsage)
        .where(gte(schema.commandUsage.createdAt, startDate))
        .groupBy(schema.commandUsage.command)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(limit)
        .offset(offset)
        .all()
    );
    const popularPackagesLookup = await readD1RowArray(
      PopularPackageRowSchema,
      'Popular package rows have an invalid shape',
      await db
        .select({
          packageName: schema.commandUsage.packageName,
          count: sql<number>`COUNT(*)`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${schema.commandUsage.licenseId})`,
        })
        .from(schema.commandUsage)
        .where(
          sql`${schema.commandUsage.packageName} IS NOT NULL AND ${schema.commandUsage.createdAt} >= ${startDate.getTime()}`
        )
        .groupBy(schema.commandUsage.packageName)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(limit)
        .all()
    );
    const commandTrendsLookup = await readD1RowArray(
      CommandTrendRowSchema,
      'Command trend rows have an invalid shape',
      await db
        .select({
          date: sql<string>`date(${schema.commandUsage.createdAt} / 1000, 'unixepoch')`,
          command: schema.commandUsage.command,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.commandUsage)
        .where(gte(schema.commandUsage.createdAt, startDate))
        .groupBy(
          sql`date(${schema.commandUsage.createdAt} / 1000, 'unixepoch')`,
          schema.commandUsage.command
        )
        .orderBy(sql`date(${schema.commandUsage.createdAt} / 1000, 'unixepoch')`)
        .all()
    );
    const runtimeUsageLookup = await readD1RowArray(
      RuntimeUsageRowSchema,
      'Runtime usage rows have an invalid shape',
      await db
        .select({
          runtimeName: schema.commandUsage.runtimeName,
          count: sql<number>`COUNT(*)`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${schema.commandUsage.licenseId})`,
        })
        .from(schema.commandUsage)
        .where(
          sql`${schema.commandUsage.runtimeName} IS NOT NULL AND ${schema.commandUsage.createdAt} >= ${startDate.getTime()}`
        )
        .groupBy(schema.commandUsage.runtimeName)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(limit)
        .all()
    );
    const overallStatsLookup = await readOptionalD1Row(
      AdminCommandOverallRowSchema,
      'Command overall stats have an invalid shape',
      await db
        .select({
          totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
          totalPackagesInstalled: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesInstalled}), 0)`,
          totalPackagesSearched: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesSearched}), 0)`,
          totalRuntimesSwitched: sql<number>`COALESCE(SUM(${schema.usageDaily.runtimesSwitched}), 0)`,
          totalSbomGenerated: sql<number>`COALESCE(SUM(${schema.usageDaily.sbomGenerated}), 0)`,
          uniqueLicenses: sql<number>`COUNT(DISTINCT ${schema.usageDaily.licenseId})`,
        })
        .from(schema.usageDaily)
        .where(gte(schema.usageDaily.date, dateStr))
        .get()
    );
    const dailyTotalsLookup = await readD1RowArray(
      AdminDailyTotalsRowSchema,
      'Daily command totals have an invalid shape',
      await db
        .select({
          date: schema.usageDaily.date,
          commands: sql<number>`SUM(${schema.usageDaily.commandsRun})`,
          packages: sql<number>`SUM(${schema.usageDaily.packagesInstalled})`,
          searches: sql<number>`SUM(${schema.usageDaily.packagesSearched})`,
        })
        .from(schema.usageDaily)
        .where(gte(schema.usageDaily.date, dateStr))
        .groupBy(schema.usageDaily.date)
        .orderBy(schema.usageDaily.date)
        .all()
    );
    const totalCommandsLookup = await readOptionalD1Row(
      CountRowSchema,
      'Distinct command count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(DISTINCT ${schema.commandUsage.command})` })
        .from(schema.commandUsage)
        .where(gte(schema.commandUsage.createdAt, startDate))
        .get()
    );
    if (
      commandDistributionLookup._tag === 'invalid' ||
      popularPackagesLookup._tag === 'invalid' ||
      commandTrendsLookup._tag === 'invalid' ||
      runtimeUsageLookup._tag === 'invalid' ||
      isInvalidD1Row(overallStatsLookup) ||
      dailyTotalsLookup._tag === 'invalid' ||
      isInvalidD1Row(totalCommandsLookup)
    ) {
      return storedDataErrorResponse();
    }

    const overallStats = optionalD1RowValue(overallStatsLookup);

    return new Response(
      JSON.stringify({
        distribution: commandDistributionLookup.value.map(c => ({
          command: c.command,
          count: c.count,
          successCount: c.successCount,
          failureCount: c.failureCount,
          successRate: c.count > 0 ? Math.round((c.successCount / c.count) * 100) : 0,
          avgDurationMs: Math.round(c.avgDurationMs),
        })),
        popularPackages: popularPackagesLookup.value.map(p => ({
          packageName: p.packageName ?? null,
          count: p.count,
          uniqueUsers: p.uniqueUsers,
        })),
        runtimeUsage: runtimeUsageLookup.value.map(r => ({
          runtimeName: r.runtimeName ?? null,
          count: r.count,
          uniqueUsers: r.uniqueUsers,
        })),
        trends: commandTrendsLookup.value.map(t => ({
          date: t.date,
          command: t.command,
          count: t.count,
        })),
        dailyTotals: dailyTotalsLookup.value.map(d => ({
          date: d.date,
          commands: d.commands,
          packages: d.packages,
          searches: d.searches,
        })),
        summary: {
          totalCommands: overallStats?.totalCommands ?? 0,
          totalPackagesInstalled: overallStats?.totalPackagesInstalled ?? 0,
          totalPackagesSearched: overallStats?.totalPackagesSearched ?? 0,
          totalRuntimesSwitched: overallStats?.totalRuntimesSwitched ?? 0,
          totalSbomGenerated: overallStats?.totalSbomGenerated ?? 0,
          uniqueUsers: overallStats?.uniqueLicenses ?? 0,
          periodDays: days,
        },
        pagination: {
          limit,
          offset,
          total: optionalD1RowValue(totalCommandsLookup)?.count ?? 0,
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
    console.error('[Admin Commands Analytics] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
