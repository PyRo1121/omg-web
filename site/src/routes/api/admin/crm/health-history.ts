import type { APIEvent } from '@solidjs/start/server';
import { sql, eq, desc, gte, and } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { internalErrorResponse, storedDataErrorResponse } from '~/lib/api-error';
import {
  CountRowSchema,
  CustomerIdentityRowSchema,
  HealthHistoryRowSchema,
  HealthStatsRowSchema,
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
    const customerId = url.searchParams.get('customerId');
    const days = parseInt(url.searchParams.get('days') || '90');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 365);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (!customerId) {
      return new Response(JSON.stringify({ error: 'customerId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify customer exists
    const customerLookup = await readOptionalD1Row(
      CustomerIdentityRowSchema,
      'Customer identity row has an invalid shape',
      await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
        })
        .from(schema.user)
        .where(eq(schema.user.id, customerId))
        .limit(1)
        .get()
    );
    if (isInvalidD1Row(customerLookup)) {
      return storedDataErrorResponse();
    }
    if (customerLookup._tag === 'missing') {
      return new Response(JSON.stringify({ error: 'Customer not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const customer = customerLookup.value;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get health history
    const historyLookup = await readD1RowArray(
      HealthHistoryRowSchema,
      'Health history rows have an invalid shape',
      await db
        .select({
          id: schema.customerHealthHistory.id,
          overallScore: schema.customerHealthHistory.overallScore,
          engagementScore: schema.customerHealthHistory.engagementScore,
          activationScore: schema.customerHealthHistory.activationScore,
          growthScore: schema.customerHealthHistory.growthScore,
          riskScore: schema.customerHealthHistory.riskScore,
          lifecycleStage: schema.customerHealthHistory.lifecycleStage,
          churnProbability: schema.customerHealthHistory.churnProbability,
          upgradeProbability: schema.customerHealthHistory.upgradeProbability,
          commandVelocity7d: schema.customerHealthHistory.commandVelocity7d,
          recordedAt: schema.customerHealthHistory.recordedAt,
        })
        .from(schema.customerHealthHistory)
        .where(
          and(
            eq(schema.customerHealthHistory.userId, customerId),
            gte(schema.customerHealthHistory.recordedAt, startDate)
          )
        )
        .orderBy(desc(schema.customerHealthHistory.recordedAt))
        .limit(limit)
        .offset(offset)
        .all()
    );
    if (historyLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const history = historyLookup.value;

    // Get latest score
    const latestScore = history.length > 0 ? history[0] : null;

    // Calculate trends
    let overallTrend = 'stable';
    let churnTrend = 'stable';

    if (history.length >= 2) {
      const recentScores = history.slice(0, Math.min(7, history.length));
      const olderScores = history.slice(Math.min(7, history.length));

      if (olderScores.length > 0) {
        const recentAvg =
          recentScores.reduce((sum, h) => sum + h.overallScore, 0) / recentScores.length;
        const olderAvg =
          olderScores.reduce((sum, h) => sum + h.overallScore, 0) / olderScores.length;

        if (recentAvg > olderAvg + 5) {
          overallTrend = 'improving';
        } else if (recentAvg < olderAvg - 5) {
          overallTrend = 'declining';
        }

        const recentChurnAvg =
          recentScores.reduce((sum, h) => sum + h.churnProbability, 0) / recentScores.length;
        const olderChurnAvg =
          olderScores.reduce((sum, h) => sum + h.churnProbability, 0) / olderScores.length;

        if (recentChurnAvg > olderChurnAvg + 5) {
          churnTrend = 'increasing';
        } else if (recentChurnAvg < olderChurnAvg - 5) {
          churnTrend = 'decreasing';
        }
      }
    }

    // Get min/max/avg for the period
    const statsLookup = await readOptionalD1Row(
      HealthStatsRowSchema,
      'Health history stats have an invalid shape',
      await db
        .select({
          minScore: sql<number>`MIN(${schema.customerHealthHistory.overallScore})`,
          maxScore: sql<number>`MAX(${schema.customerHealthHistory.overallScore})`,
          avgScore: sql<number>`AVG(${schema.customerHealthHistory.overallScore})`,
          minChurn: sql<number>`MIN(${schema.customerHealthHistory.churnProbability})`,
          maxChurn: sql<number>`MAX(${schema.customerHealthHistory.churnProbability})`,
          avgChurn: sql<number>`AVG(${schema.customerHealthHistory.churnProbability})`,
          recordCount: sql<number>`COUNT(*)`,
        })
        .from(schema.customerHealthHistory)
        .where(
          and(
            eq(schema.customerHealthHistory.userId, customerId),
            gte(schema.customerHealthHistory.recordedAt, startDate)
          )
        )
        .get()
    );
    const totalCountLookup = await readOptionalD1Row(
      CountRowSchema,
      'Health history count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.customerHealthHistory)
        .where(
          and(
            eq(schema.customerHealthHistory.userId, customerId),
            gte(schema.customerHealthHistory.recordedAt, startDate)
          )
        )
        .get()
    );
    if (isInvalidD1Row(statsLookup) || isInvalidD1Row(totalCountLookup)) {
      return storedDataErrorResponse();
    }
    const stats = optionalD1RowValue(statsLookup);

    // Get lifecycle stage changes
    const lifecycleChanges: Array<{
      from: string;
      to: string;
      changedAt: string;
    }> = [];

    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i + 1];
      if (current === undefined || next === undefined) {
        continue;
      }
      if (current.lifecycleStage !== next.lifecycleStage) {
        lifecycleChanges.push({
          from: next.lifecycleStage,
          to: current.lifecycleStage,
          changedAt: current.recordedAt.toISOString(),
        });
      }
    }

    return new Response(
      JSON.stringify({
        customer: {
          id: customer.id,
          name: customer.name ?? null,
          email: customer.email ?? null,
        },
        current: latestScore
          ? {
              overallScore: latestScore.overallScore,
              engagementScore: latestScore.engagementScore,
              activationScore: latestScore.activationScore,
              growthScore: latestScore.growthScore,
              riskScore: latestScore.riskScore,
              lifecycleStage: latestScore.lifecycleStage,
              churnProbability: latestScore.churnProbability,
              upgradeProbability: latestScore.upgradeProbability,
              commandVelocity7d: latestScore.commandVelocity7d,
              recordedAt: latestScore.recordedAt.toISOString(),
            }
          : null,
        history: history.map(h => ({
          id: h.id,
          overallScore: h.overallScore,
          engagementScore: h.engagementScore,
          activationScore: h.activationScore,
          growthScore: h.growthScore,
          riskScore: h.riskScore,
          lifecycleStage: h.lifecycleStage,
          churnProbability: h.churnProbability,
          upgradeProbability: h.upgradeProbability,
          commandVelocity7d: h.commandVelocity7d,
          recordedAt: h.recordedAt.toISOString(),
        })),
        trends: {
          overallScore: overallTrend,
          churnProbability: churnTrend,
        },
        lifecycleChanges,
        stats: {
          minScore: stats?.minScore ?? 0,
          maxScore: stats?.maxScore ?? 0,
          avgScore: Math.round(stats?.avgScore ?? 0),
          minChurnProbability: stats?.minChurn ?? 0,
          maxChurnProbability: stats?.maxChurn ?? 0,
          avgChurnProbability: Math.round(stats?.avgChurn ?? 0),
          recordCount: stats?.recordCount ?? 0,
          periodDays: days,
        },
        pagination: {
          limit,
          offset,
          total: optionalD1RowValue(totalCountLookup)?.count ?? 0,
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
    console.error('[Admin CRM Health History] Error:', error);
    return internalErrorResponse();
  }
}
