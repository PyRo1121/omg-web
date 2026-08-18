import type { APIEvent } from '@solidjs/start/server';
import { Effect, Exit } from 'effect';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, gte, sql, and } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { ACHIEVEMENTS, checkAchievementProgress } from '~/lib/achievements';
import { parseTelemetryDashboard } from '~/lib/contracts/telemetry-dashboard';
import type { TelemetryDashboardResponse } from '~/types/telemetry';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  CountRowSchema,
  LicenseRowSchema,
  MachineRowSchema,
  UsageDailyRowSchema,
  UsageTotalsRowSchema,
  UserAchievementJoinRowSchema,
  UserRoleRowSchema,
  WeekStatsRowSchema,
  isInvalidD1Row,
  optionalD1RowValue,
  readD1RowArray,
  readOptionalD1Row,
} from '~/lib/contracts/d1-rows';

function internalErrorResponse(): Response {
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readCloudflareEnv(event: APIEvent): CloudflareEnv | null {
  const env = event.nativeEvent.context.cloudflare?.env;
  if (!env) {
    return null;
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

function getTierFeatures(tier: string): string[] {
  const features = new Map([
    ['free', ['1 machine', 'Basic telemetry', 'Community support']],
    ['team', ['25 machines', 'Advanced analytics', 'Team dashboard', 'Email support']],
    ['enterprise', ['Unlimited machines', 'Custom integrations', 'Dedicated support', 'SLA']],
  ]);
  return [...(features.get(tier) ?? features.get('free') ?? [])];
}

export async function GET(event: APIEvent) {
  const env = readCloudflareEnv(event);
  if (env === null) {
    console.error('[Telemetry API] Cloudflare environment not available');
    return internalErrorResponse();
  }

  try {
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

    console.log('[Dashboard API] Querying license for userId:', userId);

    const licenseLookup = await readOptionalD1Row(
      LicenseRowSchema,
      'License row has an invalid shape',
      await db.select().from(schema.license).where(eq(schema.license.userId, userId)).limit(1).get()
    );
    if (isInvalidD1Row(licenseLookup)) {
      return storedDataErrorResponse();
    }

    let license = optionalD1RowValue(licenseLookup);

    console.log(
      '[Dashboard API] License found:',
      license ? `id=${license.id}, tier=${license.tier}` : 'null'
    );

    if (!license) {
      console.log('[Dashboard API] No license found, creating new "free" license');
      const licenseKey = crypto.randomUUID();
      const licenseId = crypto.randomUUID();

      await db
        .insert(schema.license)
        .values({
          id: licenseId,
          userId: userId,
          licenseKey: licenseKey,
          tier: 'free',
          status: 'active',
          maxMachines: 1,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      const createdLookup = await readOptionalD1Row(
        LicenseRowSchema,
        'Created license row has an invalid shape',
        await db
          .select()
          .from(schema.license)
          .where(eq(schema.license.id, licenseId))
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(createdLookup) || createdLookup._tag === 'missing') {
        return new Response(JSON.stringify({ error: 'Failed to create license' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      license = createdLookup.value;

      console.log('[Dashboard API] Created new license:', `id=${license.id}, tier=${license.tier}`);
    }

    const machinesLookup = await readD1RowArray(
      MachineRowSchema,
      'Machine rows have an invalid shape',
      await db
        .select()
        .from(schema.machine)
        .where(eq(schema.machine.licenseId, license.id))
        .orderBy(desc(schema.machine.lastSeenAt))
        .all()
    );
    if (machinesLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const machines = machinesLookup.value;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr30 = thirtyDaysAgo.toISOString().split('T')[0];

    const usageStatsResult = await db
      .select({
        totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
        totalPackagesInstalled: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesInstalled}), 0)`,
        totalPackagesSearched: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesSearched}), 0)`,
        totalRuntimesSwitched: sql<number>`COALESCE(SUM(${schema.usageDaily.runtimesSwitched}), 0)`,
        totalSbomGenerated: sql<number>`COALESCE(SUM(${schema.usageDaily.sbomGenerated}), 0)`,
        totalVulnerabilitiesFound: sql<number>`COALESCE(SUM(${schema.usageDaily.vulnerabilitiesFound}), 0)`,
        totalTimeSavedMs: sql<number>`COALESCE(SUM(${schema.usageDaily.timeSavedMs}), 0)`,
      })
      .from(schema.usageDaily)
      .where(
        and(eq(schema.usageDaily.licenseId, license.id), gte(schema.usageDaily.date, dateStr30))
      )
      .get();

    const usageStatsLookup = await readOptionalD1Row(
      UsageTotalsRowSchema,
      'Usage totals have an invalid shape',
      usageStatsResult
    );
    if (isInvalidD1Row(usageStatsLookup)) {
      return storedDataErrorResponse();
    }
    const usageTotals = optionalD1RowValue(usageStatsLookup);

    const usageStats = {
      total_commands: usageTotals?.totalCommands ?? 0,
      total_packages_installed: usageTotals?.totalPackagesInstalled ?? 0,
      total_packages_searched: usageTotals?.totalPackagesSearched ?? 0,
      total_runtimes_switched: usageTotals?.totalRuntimesSwitched ?? 0,
      total_sbom_generated: usageTotals?.totalSbomGenerated ?? 0,
      total_vulnerabilities_found: usageTotals?.totalVulnerabilitiesFound ?? 0,
      total_time_saved_ms: usageTotals?.totalTimeSavedMs ?? 0,
    };

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dateStr14 = fourteenDaysAgo.toISOString().split('T')[0];

    const dailyUsage = await db
      .select()
      .from(schema.usageDaily)
      .where(
        and(eq(schema.usageDaily.licenseId, license.id), gte(schema.usageDaily.date, dateStr14))
      )
      .orderBy(desc(schema.usageDaily.date))
      .all();

    const dailyUsageLookup = await readD1RowArray(
      UsageDailyRowSchema,
      'Daily usage rows have an invalid shape',
      dailyUsage
    );
    if (dailyUsageLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr7 = sevenDaysAgo.toISOString().split('T')[0];

    const lastWeekStats = await db
      .select({
        totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
        totalTimeSaved: sql<number>`COALESCE(SUM(${schema.usageDaily.timeSavedMs}), 0)`,
      })
      .from(schema.usageDaily)
      .where(
        and(eq(schema.usageDaily.licenseId, license.id), gte(schema.usageDaily.date, dateStr7))
      )
      .get();

    const previousWeekStats = await db
      .select({
        totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
        totalTimeSaved: sql<number>`COALESCE(SUM(${schema.usageDaily.timeSavedMs}), 0)`,
      })
      .from(schema.usageDaily)
      .where(
        and(
          eq(schema.usageDaily.licenseId, license.id),
          gte(schema.usageDaily.date, dateStr14),
          sql`${schema.usageDaily.date} < ${dateStr7}`
        )
      )
      .get();

    const lastWeekLookup = await readOptionalD1Row(
      WeekStatsRowSchema,
      'Last-week stats have an invalid shape',
      lastWeekStats
    );
    const previousWeekLookup = await readOptionalD1Row(
      WeekStatsRowSchema,
      'Previous-week stats have an invalid shape',
      previousWeekStats
    );
    if (isInvalidD1Row(lastWeekLookup) || isInvalidD1Row(previousWeekLookup)) {
      return storedDataErrorResponse();
    }
    const lastWeek = optionalD1RowValue(lastWeekLookup);
    const previousWeek = optionalD1RowValue(previousWeekLookup);

    const commandsTrend = previousWeek?.totalCommands
      ? ((Number(lastWeek?.totalCommands || 0) - Number(previousWeek.totalCommands)) /
          Number(previousWeek.totalCommands)) *
        100
      : 0;

    const timeSavedTrend = previousWeek?.totalTimeSaved
      ? ((Number(lastWeek?.totalTimeSaved || 0) - Number(previousWeek.totalTimeSaved)) /
          Number(previousWeek.totalTimeSaved)) *
        100
      : 0;

    const userAchievements = await db
      .select({
        id: schema.userAchievement.id,
        achievementId: schema.userAchievement.achievementId,
        progress: schema.userAchievement.progress,
        isUnlocked: schema.userAchievement.isUnlocked,
        unlockedAt: schema.userAchievement.unlockedAt,
        name: schema.achievementDefinition.name,
        description: schema.achievementDefinition.description,
        icon: schema.achievementDefinition.icon,
        category: schema.achievementDefinition.category,
        points: schema.achievementDefinition.points,
      })
      .from(schema.userAchievement)
      .innerJoin(
        schema.achievementDefinition,
        eq(schema.userAchievement.achievementId, schema.achievementDefinition.id)
      )
      .where(eq(schema.userAchievement.userId, userId))
      .all();

    const userAchievementsLookup = await readD1RowArray(
      UserAchievementJoinRowSchema,
      'Achievement rows have an invalid shape',
      userAchievements
    );
    if (userAchievementsLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const achievementMap = new Map(userAchievementsLookup.value.map(a => [a.achievementId, a]));

    const achievementStats = {
      commands_run: usageStats.total_commands,
      packages_searched: usageStats.total_packages_searched,
      packages_installed: usageStats.total_packages_installed,
      runtimes_switched: usageStats.total_runtimes_switched,
      sbom_generated: usageStats.total_sbom_generated,
      vulnerabilities_found: usageStats.total_vulnerabilities_found,
      time_saved_ms: usageStats.total_time_saved_ms,
    };

    const achievements = ACHIEVEMENTS.map(def => {
      const userAch = achievementMap.get(def.id);
      const progress = userAch?.progress || checkAchievementProgress(def, achievementStats);
      const isUnlocked = userAch?.isUnlocked || progress >= 100;

      return {
        id: def.id,
        achievement_id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        points: def.points,
        progress: Math.round(progress),
        unlocked: isUnlocked,
        unlocked_at: userAch?.unlockedAt?.toISOString() || null,
      };
    });

    const totalUsers = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${schema.license.userId})` })
      .from(schema.license)
      .get();

    const userRank = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.usageDaily)
      .groupBy(schema.usageDaily.licenseId)
      .having(sql`SUM(${schema.usageDaily.commandsRun}) < ${usageStats.total_commands}`)
      .all();

    const totalUsersLookup = await readOptionalD1Row(
      CountRowSchema,
      'Total user count has an invalid shape',
      totalUsers
    );
    const userRankLookup = await readD1RowArray(
      CountRowSchema,
      'User rank rows have an invalid shape',
      userRank
    );
    if (isInvalidD1Row(totalUsersLookup) || userRankLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }
    const totalUserCount = optionalD1RowValue(totalUsersLookup)?.count ?? 0;

    const percentile =
      totalUserCount > 0 ? Math.round((userRankLookup.value.length / totalUserCount) * 100) : 0;

    console.log('[Dashboard API] Returning tier to frontend:', license.tier);

    const userRecord = await db
      .select({ role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1)
      .get();

    const userRecordLookup = await readOptionalD1Row(
      UserRoleRowSchema,
      'User role row has an invalid shape',
      userRecord
    );
    if (isInvalidD1Row(userRecordLookup)) {
      return storedDataErrorResponse();
    }
    if (userRecordLookup._tag === 'missing') {
      return storedDataErrorResponse();
    }

    const response: TelemetryDashboardResponse = {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: userRecordLookup.value.role,
      },
      license: {
        id: license.id,
        license_key: license.licenseKey,
        tier: license.tier,
        status: license.status,
        max_machines: license.maxMachines,
        expires_at: license.expiresAt?.toISOString() || null,
        features: getTierFeatures(license.tier),
      },
      machines: machines.map(m => ({
        id: m.id,
        machine_id: m.machineId,
        hostname: m.hostname ?? null,
        os: m.os ?? null,
        arch: m.arch ?? null,
        omg_version: m.omgVersion ?? null,
        is_active: m.isActive ? 1 : 0,
        last_seen_at: m.lastSeenAt.toISOString(),
      })),
      usage: {
        ...usageStats,
        commands_trend: Math.round(commandsTrend * 10) / 10,
        time_saved_trend: Math.round(timeSavedTrend * 10) / 10,
      },
      daily: dailyUsageLookup.value.map(d => ({
        date: d.date,
        commands_run: d.commandsRun,
        packages_installed: d.packagesInstalled,
        packages_searched: d.packagesSearched,
        time_saved_ms: d.timeSavedMs,
      })),
      achievements,
      global_stats:
        usageStats.total_commands > 0
          ? {
              top_package: 'Coming Soon',
              top_runtime: 'Coming Soon',
              percentile: Math.max(percentile, 1),
            }
          : undefined,
    };

    const encoded = await Effect.runPromiseExit(parseTelemetryDashboard(response));
    return Exit.match(encoded, {
      onFailure: cause => {
        console.error('[Telemetry API] Outbound payload failed schema encode', cause);
        return internalErrorResponse();
      },
      onSuccess: payload =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          },
        }),
    });
  } catch (error: unknown) {
    console.error('[Telemetry API] Error:', error);
    return internalErrorResponse();
  }
}
