import type { APIEvent } from '@solidjs/start/server';
import { gte } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { internalErrorResponse, storedDataErrorResponse } from '~/lib/api-error';
import {
  CohortUsageRowSchema,
  CohortUserRowSchema,
  LicenseUserIdRowSchema,
  readD1RowArray,
} from '~/lib/contracts/d1-rows';

export async function GET(event: APIEvent) {
  try {
    const adminCheck = await requireAdmin(event);
    if (adminCheck instanceof Response) {
      return adminCheck;
    }

    const { db } = adminCheck;

    const url = new URL(event.request.url);
    const weeks = parseInt(url.searchParams.get('weeks') || '12');

    // Get signup cohorts by week
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);

    // Get all users with their signup week
    const usersLookup = await readD1RowArray(
      CohortUserRowSchema,
      'Cohort user rows have an invalid shape',
      await db
        .select({
          id: schema.user.id,
          createdAt: schema.user.createdAt,
        })
        .from(schema.user)
        .where(gte(schema.user.createdAt, startDate))
        .all()
    );
    const licensesLookup = await readD1RowArray(
      LicenseUserIdRowSchema,
      'Cohort license rows have an invalid shape',
      await db
        .select({
          id: schema.license.id,
          userId: schema.license.userId,
        })
        .from(schema.license)
        .all()
    );
    const usageDataLookup = await readD1RowArray(
      CohortUsageRowSchema,
      'Cohort usage rows have an invalid shape',
      await db
        .select({
          licenseId: schema.usageDaily.licenseId,
          date: schema.usageDaily.date,
          commandsRun: schema.usageDaily.commandsRun,
        })
        .from(schema.usageDaily)
        .where(gte(schema.usageDaily.date, startDate.toISOString().split('T')[0]))
        .all()
    );
    if (
      usersLookup._tag === 'invalid' ||
      licensesLookup._tag === 'invalid' ||
      usageDataLookup._tag === 'invalid'
    ) {
      return storedDataErrorResponse();
    }
    const users = usersLookup.value;
    const licenses = licensesLookup.value;
    const usageData = usageDataLookup.value;

    const userLicenseMap = new Map<string, string>();
    for (const license of licenses) {
      userLicenseMap.set(license.userId, license.id);
    }

    const cohorts: Array<{
      cohortWeek: string;
      signupCount: number;
      retentionByWeek: Array<{
        weekNumber: number;
        activeUsers: number;
        retentionRate: number;
      }>;
    }> = [];

    // Group users by signup week
    const usersByCohort = new Map<string, Array<{ id: string; createdAt: Date }>>();

    for (const user of users) {
      const createdAt = new Date(user.createdAt);
      const weekStart = getWeekStart(createdAt);
      const cohortKey = weekStart.toISOString().split('T')[0];

      if (!usersByCohort.has(cohortKey)) {
        usersByCohort.set(cohortKey, []);
      }
      const cohortUsers = usersByCohort.get(cohortKey);
      if (cohortUsers === undefined) {
        continue;
      }
      cohortUsers.push({
        id: user.id,
        createdAt: new Date(user.createdAt),
      });
    }

    // Build usage by license and week
    const usageByLicenseWeek = new Map<string, Set<string>>();
    for (const usage of usageData) {
      if (usage.commandsRun > 0) {
        const usageDate = new Date(usage.date);
        const weekKey = getWeekStart(usageDate).toISOString().split('T')[0];
        const key = `${usage.licenseId}:${weekKey}`;

        if (!usageByLicenseWeek.has(key)) {
          usageByLicenseWeek.set(key, new Set());
        }
        const weekSet = usageByLicenseWeek.get(key);
        if (weekSet === undefined) {
          continue;
        }
        weekSet.add(usage.date);
      }
    }

    // Calculate retention for each cohort
    const sortedCohorts = Array.from(usersByCohort.keys()).toSorted();

    for (const cohortWeek of sortedCohorts) {
      const cohortUsers = usersByCohort.get(cohortWeek);
      if (cohortUsers === undefined) {
        continue;
      }
      const retentionByWeek: Array<{
        weekNumber: number;
        activeUsers: number;
        retentionRate: number;
      }> = [];

      const cohortStartDate = new Date(cohortWeek);
      const weeksToCheck = Math.min(
        weeks,
        Math.floor((now.getTime() - cohortStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      );

      for (let weekNum = 0; weekNum <= weeksToCheck; weekNum++) {
        const weekStartDate = new Date(cohortStartDate);
        weekStartDate.setDate(weekStartDate.getDate() + weekNum * 7);
        const weekKey = getWeekStart(weekStartDate).toISOString().split('T')[0];

        let activeCount = 0;
        for (const user of cohortUsers) {
          const licenseId = userLicenseMap.get(user.id);
          if (licenseId) {
            const key = `${licenseId}:${weekKey}`;
            if (usageByLicenseWeek.has(key)) {
              activeCount++;
            }
          }
        }

        retentionByWeek.push({
          weekNumber: weekNum,
          activeUsers: activeCount,
          retentionRate:
            cohortUsers.length > 0 ? Math.round((activeCount / cohortUsers.length) * 100) : 0,
        });
      }

      cohorts.push({
        cohortWeek,
        signupCount: cohortUsers.length,
        retentionByWeek,
      });
    }

    // Calculate summary metrics
    const totalSignups = users.length;
    const avgWeek1Retention =
      cohorts.length > 0
        ? Math.round(
            cohorts
              .filter(c => c.retentionByWeek.length > 1)
              .reduce((sum, c) => sum + (c.retentionByWeek[1]?.retentionRate || 0), 0) /
              cohorts.filter(c => c.retentionByWeek.length > 1).length
          )
        : 0;

    const avgWeek4Retention =
      cohorts.length > 0
        ? Math.round(
            cohorts
              .filter(c => c.retentionByWeek.length > 4)
              .reduce((sum, c) => sum + (c.retentionByWeek[4]?.retentionRate || 0), 0) /
              cohorts.filter(c => c.retentionByWeek.length > 4).length || 1
          )
        : 0;

    return new Response(
      JSON.stringify({
        cohorts,
        summary: {
          totalSignups,
          avgWeek1Retention,
          avgWeek4Retention,
          cohortsAnalyzed: cohorts.length,
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
    console.error('[Admin Cohort Analytics] Error:', error);
    return internalErrorResponse();
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
