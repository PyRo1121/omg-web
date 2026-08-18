import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, gte, sql, and } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { internalErrorResponse, storedDataErrorResponse } from '~/lib/api-error';
import {
  CommandCountRowSchema,
  DailyUsageChartRowSchema,
  FeatureUsageRowSchema,
  LicenseRowSchema,
  MachineRowSchema,
  TotalCommandsRowSchema,
  isInvalidD1Row,
  optionalD1RowValue,
  readD1RowArray,
  readOptionalD1Row,
} from '~/lib/contracts/d1-rows';

function getEnv(event: APIEvent): CloudflareEnv {
  const env = event.nativeEvent.context.cloudflare?.env;
  if (!env) {
    throw new Error('Cloudflare environment not available');
  }

  return {
    DB: env.DB,
    BETTER_AUTH_KV: env.BETTER_AUTH_KV,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  };
}

export interface UserUsageResponse {
  totalCommandsThisMonth: number;
  commandsThisWeek: number;
  commandsTrend: number;
  activeMachinesCount: number;
  totalMachinesCount: number;
  commandDistribution: Array<{
    command: string;
    count: number;
    percentage: number;
  }>;
  featureAdoption: Array<{
    feature: string;
    adopted: boolean;
    usageCount: number;
    lastUsed: string | null;
  }>;
  dailyUsage: Array<{
    date: string;
    commands: number;
    timeSavedMs: number;
  }>;
}

export async function GET(event: APIEvent) {
  try {
    const env = getEnv(event);
    const auth = createAuth(env);

    const session = await auth.api.getSession({
      headers: event.request.headers,
    });

    if (!session?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = drizzle(env.DB, { schema });
    const userId = session.user.id;

    const licenseLookup = await readOptionalD1Row(
      LicenseRowSchema,
      'License row has an invalid shape',
      await db.select().from(schema.license).where(eq(schema.license.userId, userId)).limit(1).get()
    );
    if (isInvalidD1Row(licenseLookup)) {
      return storedDataErrorResponse();
    }
    if (licenseLookup._tag === 'missing') {
      return new Response(JSON.stringify({ error: 'No license found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const licenseId = licenseLookup.value.id;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const twoWeeksAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const monthlyLookup = await readOptionalD1Row(
      TotalCommandsRowSchema,
      'Monthly usage totals have an invalid shape',
      await db
        .select({
          totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
        })
        .from(schema.usageDaily)
        .where(
          and(
            eq(schema.usageDaily.licenseId, licenseId),
            gte(schema.usageDaily.date, startOfMonthStr)
          )
        )
        .get()
    );
    const thisWeekLookup = await readOptionalD1Row(
      TotalCommandsRowSchema,
      'This-week usage totals have an invalid shape',
      await db
        .select({
          totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
        })
        .from(schema.usageDaily)
        .where(
          and(eq(schema.usageDaily.licenseId, licenseId), gte(schema.usageDaily.date, weekAgoStr))
        )
        .get()
    );
    const lastWeekLookup = await readOptionalD1Row(
      TotalCommandsRowSchema,
      'Last-week usage totals have an invalid shape',
      await db
        .select({
          totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
        })
        .from(schema.usageDaily)
        .where(
          and(
            eq(schema.usageDaily.licenseId, licenseId),
            gte(schema.usageDaily.date, twoWeeksAgoStr),
            sql`${schema.usageDaily.date} < ${weekAgoStr}`
          )
        )
        .get()
    );
    if (
      isInvalidD1Row(monthlyLookup) ||
      isInvalidD1Row(thisWeekLookup) ||
      isInvalidD1Row(lastWeekLookup)
    ) {
      return storedDataErrorResponse();
    }

    const thisWeekCommands = optionalD1RowValue(thisWeekLookup)?.totalCommands ?? 0;
    const lastWeekCommands = optionalD1RowValue(lastWeekLookup)?.totalCommands ?? 0;
    const commandsTrend =
      lastWeekCommands > 0 ? ((thisWeekCommands - lastWeekCommands) / lastWeekCommands) * 100 : 0;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const machinesLookup = await readD1RowArray(
      MachineRowSchema,
      'Machine rows have an invalid shape',
      await db.select().from(schema.machine).where(eq(schema.machine.licenseId, licenseId)).all()
    );
    if (machinesLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const machines = machinesLookup.value;
    const activeMachines = machines.filter(
      m => m.isActive && m.lastSeenAt.getTime() > oneDayAgo.getTime()
    );

    const commandDistributionLookup = await readD1RowArray(
      CommandCountRowSchema,
      'Command distribution rows have an invalid shape',
      await db
        .select({
          command: schema.commandUsage.command,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.commandUsage)
        .where(
          and(
            eq(schema.commandUsage.licenseId, licenseId),
            gte(schema.commandUsage.createdAt, startOfMonth)
          )
        )
        .groupBy(schema.commandUsage.command)
        .orderBy(desc(sql`COUNT(*)`))
        .all()
    );
    if (commandDistributionLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const commandDistribution = commandDistributionLookup.value;
    const totalCommands = commandDistribution.reduce((sum, c) => sum + c.count, 0);

    const featureChecks = [
      { feature: 'aur', check: 'aur' },
      { feature: 'daemon', check: 'daemon' },
      { feature: 'sbom', check: 'sbom' },
      { feature: 'fleet', check: 'fleet' },
      { feature: 'runtimes', check: 'use' },
      { feature: 'audit', check: 'audit' },
    ];

    const featureAdoptionLookups = await Promise.all(
      featureChecks.map(async ({ feature, check }) => {
        const usageLookup = await readOptionalD1Row(
          FeatureUsageRowSchema,
          'Feature usage row has an invalid shape',
          await db
            .select({
              count: sql<number>`COUNT(*)`,
              lastUsed: sql<number>`MAX(${schema.commandUsage.createdAt})`,
            })
            .from(schema.commandUsage)
            .where(
              and(
                eq(schema.commandUsage.licenseId, licenseId),
                sql`${schema.commandUsage.command} LIKE '%${check}%' OR ${schema.commandUsage.packageName} LIKE '%${check}%'`
              )
            )
            .get()
        );
        return { feature, usageLookup };
      })
    );
    if (featureAdoptionLookups.some(item => isInvalidD1Row(item.usageLookup))) {
      return storedDataErrorResponse();
    }

    const featureAdoption = featureAdoptionLookups.map(({ feature, usageLookup }) => {
      const usage = optionalD1RowValue(usageLookup);
      const usageCount = usage?.count ?? 0;
      return {
        feature,
        adopted: usageCount > 0,
        usageCount,
        lastUsed: usage?.lastUsed ? usage.lastUsed.toISOString() : null,
      };
    });

    const dailyUsageLookup = await readD1RowArray(
      DailyUsageChartRowSchema,
      'Daily usage rows have an invalid shape',
      await db
        .select({
          date: schema.usageDaily.date,
          commands: schema.usageDaily.commandsRun,
          timeSavedMs: schema.usageDaily.timeSavedMs,
        })
        .from(schema.usageDaily)
        .where(
          and(eq(schema.usageDaily.licenseId, licenseId), gte(schema.usageDaily.date, monthAgoStr))
        )
        .orderBy(schema.usageDaily.date)
        .all()
    );
    if (dailyUsageLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    const response: UserUsageResponse = {
      totalCommandsThisMonth: optionalD1RowValue(monthlyLookup)?.totalCommands ?? 0,
      commandsThisWeek: thisWeekCommands,
      commandsTrend: Math.round(commandsTrend * 10) / 10,
      activeMachinesCount: activeMachines.length,
      totalMachinesCount: machines.length,
      commandDistribution: commandDistribution.map(c => ({
        command: c.command,
        count: c.count,
        percentage: totalCommands > 0 ? Math.round((c.count / totalCommands) * 100) : 0,
      })),
      featureAdoption,
      dailyUsage: dailyUsageLookup.value.map(d => ({
        date: d.date,
        commands: d.commands,
        timeSavedMs: d.timeSavedMs,
      })),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    console.error('[User Usage API] Error:', error);
    return internalErrorResponse();
  }
}
