import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq, gte, and, sql } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  CommandPerformanceRowSchema,
  DailyPerformanceRowSchema,
  LicenseRowSchema,
  TimeSavedRowSchema,
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

export interface PerformanceMetric {
  metricType: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  p50Value: number;
  p95Value: number;
  sampleCount: number;
}

export interface PerformanceTrend {
  date: string;
  avgStartupMs: number;
  avgSearchMs: number;
  avgInstallMs: number;
  avgUpdateMs: number;
}

export interface PerformanceResponse {
  summary: {
    avgStartupMs: number;
    avgSearchMs: number;
    avgInstallMs: number;
    avgUpdateMs: number;
    totalTimeSavedMs: number;
    commandSuccessRate: number;
  };
  metrics: PerformanceMetric[];
  trends: PerformanceTrend[];
  sparklineData: {
    startup: number[];
    search: number[];
    install: number[];
  };
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

    const url = new URL(event.request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const commandPerformanceLookup = await readD1RowArray(
      CommandPerformanceRowSchema,
      'Command performance rows have an invalid shape',
      await db
        .select({
          command: schema.commandUsage.command,
          avgDuration: sql<number>`AVG(${schema.commandUsage.durationMs})`,
          minDuration: sql<number>`MIN(${schema.commandUsage.durationMs})`,
          maxDuration: sql<number>`MAX(${schema.commandUsage.durationMs})`,
          count: sql<number>`COUNT(*)`,
          successCount: sql<number>`SUM(CASE WHEN ${schema.commandUsage.success} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(schema.commandUsage)
        .where(
          and(
            eq(schema.commandUsage.licenseId, licenseId),
            gte(schema.commandUsage.createdAt, startDate),
            sql`${schema.commandUsage.durationMs} IS NOT NULL`
          )
        )
        .groupBy(schema.commandUsage.command)
        .all()
    );
    if (commandPerformanceLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const commandPerformance = commandPerformanceLookup.value;

    const metrics: PerformanceMetric[] = commandPerformance.map(p => ({
      metricType: p.command,
      avgValue: Math.round(p.avgDuration),
      minValue: p.minDuration,
      maxValue: p.maxDuration,
      p50Value: Math.round(p.avgDuration),
      p95Value: Math.round(p.maxDuration * 0.95),
      sampleCount: p.count,
    }));

    const searchMetric = commandPerformance.find(p => p.command === 'search');
    const installMetric = commandPerformance.find(p => p.command === 'install');
    const updateMetric = commandPerformance.find(p => p.command === 'update');

    const totalCommands = commandPerformance.reduce((sum, p) => sum + p.count, 0);
    const successfulCommands = commandPerformance.reduce((sum, p) => sum + p.successCount, 0);

    const timeSavedLookup = await readOptionalD1Row(
      TimeSavedRowSchema,
      'Time saved totals have an invalid shape',
      await db
        .select({
          totalTimeSaved: sql<number>`COALESCE(SUM(${schema.usageDaily.timeSavedMs}), 0)`,
        })
        .from(schema.usageDaily)
        .where(
          and(eq(schema.usageDaily.licenseId, licenseId), gte(schema.usageDaily.date, startDateStr))
        )
        .get()
    );
    if (isInvalidD1Row(timeSavedLookup)) {
      return storedDataErrorResponse();
    }

    const dailyPerformanceLookup = await readD1RowArray(
      DailyPerformanceRowSchema,
      'Daily performance rows have an invalid shape',
      await db
        .select({
          date: sql<string>`date(${schema.commandUsage.createdAt} / 1000, 'unixepoch')`,
          command: schema.commandUsage.command,
          avgDuration: sql<number>`AVG(${schema.commandUsage.durationMs})`,
        })
        .from(schema.commandUsage)
        .where(
          and(
            eq(schema.commandUsage.licenseId, licenseId),
            gte(schema.commandUsage.createdAt, startDate),
            sql`${schema.commandUsage.durationMs} IS NOT NULL`
          )
        )
        .groupBy(
          sql`date(${schema.commandUsage.createdAt} / 1000, 'unixepoch')`,
          schema.commandUsage.command
        )
        .orderBy(sql`date(${schema.commandUsage.createdAt} / 1000, 'unixepoch')`)
        .all()
    );
    if (dailyPerformanceLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    const trendsMap = new Map<string, PerformanceTrend>();
    dailyPerformanceLookup.value.forEach(p => {
      if (!trendsMap.has(p.date)) {
        trendsMap.set(p.date, {
          date: p.date,
          avgStartupMs: 0,
          avgSearchMs: 0,
          avgInstallMs: 0,
          avgUpdateMs: 0,
        });
      }
      const trend = trendsMap.get(p.date);
      if (trend === undefined) {
        return;
      }
      const avgMs = Math.round(p.avgDuration);
      switch (p.command) {
        case 'search':
          trend.avgSearchMs = avgMs;
          break;
        case 'install':
          trend.avgInstallMs = avgMs;
          break;
        case 'update':
          trend.avgUpdateMs = avgMs;
          break;
      }
    });

    const trends = Array.from(trendsMap.values()).toSorted((a, b) => a.date.localeCompare(b.date));

    const recentTrends = trends.slice(-14);
    const sparklineData = {
      startup: recentTrends.map(t => t.avgStartupMs),
      search: recentTrends.map(t => t.avgSearchMs),
      install: recentTrends.map(t => t.avgInstallMs),
    };

    const response: PerformanceResponse = {
      summary: {
        avgStartupMs: 0,
        avgSearchMs: Math.round(searchMetric?.avgDuration ?? 0),
        avgInstallMs: Math.round(installMetric?.avgDuration ?? 0),
        avgUpdateMs: Math.round(updateMetric?.avgDuration ?? 0),
        totalTimeSavedMs: optionalD1RowValue(timeSavedLookup)?.totalTimeSaved ?? 0,
        commandSuccessRate:
          totalCommands > 0 ? Math.round((successfulCommands / totalCommands) * 100) : 100,
      },
      metrics,
      trends,
      sparklineData,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    console.error('[Performance API] Error:', error);
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
