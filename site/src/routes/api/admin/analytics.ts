import type { APIEvent } from '@solidjs/start/server';
import { sql, gte, eq } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  CountRowSchema,
  DailyTrendRowSchema,
  Last30DaysStatsRowSchema,
  LicenseStatusCountRowSchema,
  LicenseTierCountRowSchema,
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

    const totalUsersLookup = await readOptionalD1Row(
      CountRowSchema,
      'Total users count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.user)
        .get()
    );
    const totalLicensesLookup = await readOptionalD1Row(
      CountRowSchema,
      'Total licenses count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.license)
        .get()
    );
    const licensesByTierLookup = await readD1RowArray(
      LicenseTierCountRowSchema,
      'License tier counts have an invalid shape',
      await db
        .select({
          tier: schema.license.tier,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.license)
        .groupBy(schema.license.tier)
        .all()
    );
    const licensesByStatusLookup = await readD1RowArray(
      LicenseStatusCountRowSchema,
      'License status counts have an invalid shape',
      await db
        .select({
          status: schema.license.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.license)
        .groupBy(schema.license.status)
        .all()
    );
    const totalMachinesLookup = await readOptionalD1Row(
      CountRowSchema,
      'Total machines count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.machine)
        .get()
    );
    const activeMachinesLookup = await readOptionalD1Row(
      CountRowSchema,
      'Active machines count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.machine)
        .where(eq(schema.machine.isActive, true))
        .get()
    );
    if (
      isInvalidD1Row(totalUsersLookup) ||
      isInvalidD1Row(totalLicensesLookup) ||
      licensesByTierLookup._tag === 'invalid' ||
      licensesByStatusLookup._tag === 'invalid' ||
      isInvalidD1Row(totalMachinesLookup) ||
      isInvalidD1Row(activeMachinesLookup)
    ) {
      return storedDataErrorResponse();
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr30 = thirtyDaysAgo.toISOString().split('T')[0];

    const last30DaysLookup = await readOptionalD1Row(
      Last30DaysStatsRowSchema,
      'Last-30-days stats have an invalid shape',
      await db
        .select({
          totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
          totalPackagesInstalled: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesInstalled}), 0)`,
          totalPackagesSearched: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesSearched}), 0)`,
          totalRuntimesSwitched: sql<number>`COALESCE(SUM(${schema.usageDaily.runtimesSwitched}), 0)`,
          totalTimeSaved: sql<number>`COALESCE(SUM(${schema.usageDaily.timeSavedMs}), 0)`,
        })
        .from(schema.usageDaily)
        .where(gte(schema.usageDaily.date, dateStr30))
        .get()
    );
    const dailyUsageTrendLookup = await readD1RowArray(
      DailyTrendRowSchema,
      'Daily usage trend rows have an invalid shape',
      await db
        .select({
          date: schema.usageDaily.date,
          commands: sql<number>`SUM(${schema.usageDaily.commandsRun})`,
          packages: sql<number>`SUM(${schema.usageDaily.packagesInstalled})`,
        })
        .from(schema.usageDaily)
        .where(gte(schema.usageDaily.date, dateStr30))
        .groupBy(schema.usageDaily.date)
        .orderBy(schema.usageDaily.date)
        .all()
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsersLast7DaysLookup = await readOptionalD1Row(
      CountRowSchema,
      'New users last 7 days count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.user)
        .where(gte(schema.user.createdAt, sevenDaysAgo))
        .get()
    );
    const newUsersLast30DaysLookup = await readOptionalD1Row(
      CountRowSchema,
      'New users last 30 days count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.user)
        .where(gte(schema.user.createdAt, thirtyDaysAgo))
        .get()
    );
    if (
      isInvalidD1Row(last30DaysLookup) ||
      dailyUsageTrendLookup._tag === 'invalid' ||
      isInvalidD1Row(newUsersLast7DaysLookup) ||
      isInvalidD1Row(newUsersLast30DaysLookup)
    ) {
      return storedDataErrorResponse();
    }

    const last30Days = optionalD1RowValue(last30DaysLookup);

    return new Response(
      JSON.stringify({
        overview: {
          totalUsers: optionalD1RowValue(totalUsersLookup)?.count ?? 0,
          totalLicenses: optionalD1RowValue(totalLicensesLookup)?.count ?? 0,
          totalMachines: optionalD1RowValue(totalMachinesLookup)?.count ?? 0,
          activeMachines: optionalD1RowValue(activeMachinesLookup)?.count ?? 0,
          newUsersLast7Days: optionalD1RowValue(newUsersLast7DaysLookup)?.count ?? 0,
          newUsersLast30Days: optionalD1RowValue(newUsersLast30DaysLookup)?.count ?? 0,
        },
        licenses: {
          byTier: licensesByTierLookup.value.map(l => ({
            tier: l.tier,
            count: l.count,
          })),
          byStatus: licensesByStatusLookup.value.map(l => ({
            status: l.status,
            count: l.count,
          })),
        },
        usage: {
          last30Days: {
            totalCommands: last30Days?.totalCommands ?? 0,
            totalPackagesInstalled: last30Days?.totalPackagesInstalled ?? 0,
            totalPackagesSearched: last30Days?.totalPackagesSearched ?? 0,
            totalRuntimesSwitched: last30Days?.totalRuntimesSwitched ?? 0,
            totalTimeSavedMs: last30Days?.totalTimeSaved ?? 0,
            totalTimeSavedHours:
              Math.round(((last30Days?.totalTimeSaved ?? 0) / 1000 / 60 / 60) * 10) / 10,
          },
          dailyTrend: dailyUsageTrendLookup.value.map(d => ({
            date: d.date,
            commands: d.commands,
            packages: d.packages,
          })),
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
    console.error('[Admin Analytics API] Error:', error);
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
