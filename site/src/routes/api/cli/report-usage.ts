import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { ACHIEVEMENTS, checkAchievementProgress } from '~/lib/achievements';
import { parseCLITelemetryReport } from '~/lib/dashboard-contract';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  LicenseRowSchema,
  MachineRowSchema,
  UsageDailyRowSchema,
  UserAchievementRowSchema,
  isInvalidD1Row,
  readD1RowArray,
  readOptionalD1Row,
} from '~/lib/contracts/d1-rows';

function getEnv(event: APIEvent) {
  const env = event.nativeEvent.context.cloudflare?.env;
  if (!env) {
    throw new Error('Environment not available');
  }
  return env;
}

async function updateAchievements(
  db: ReturnType<typeof drizzle>,
  userId: string,
  stats: {
    commands_run: number;
    packages_searched: number;
    packages_installed: number;
    runtimes_switched: number;
    sbom_generated: number;
    vulnerabilities_found: number;
    time_saved_ms: number;
  }
) {
  for (const achievement of ACHIEVEMENTS) {
    const progress = checkAchievementProgress(achievement, stats);
    const isUnlocked = progress >= 100;

    const existing = await db
      .select()
      .from(schema.userAchievement)
      .where(
        and(
          eq(schema.userAchievement.userId, userId),
          eq(schema.userAchievement.achievementId, achievement.id)
        )
      )
      .limit(1)
      .get();

    const existingLookup = await readOptionalD1Row(
      UserAchievementRowSchema,
      'User achievement row has an invalid shape',
      existing
    );
    if (isInvalidD1Row(existingLookup)) {
      throw new Error('Failed to load stored achievement');
    }
    const existingAchievement =
      existingLookup._tag === 'present' ? existingLookup.value : undefined;

    if (existingAchievement) {
      if (!existingAchievement.isUnlocked && isUnlocked) {
        await db
          .update(schema.userAchievement)
          .set({
            progress: Math.round(progress),
            isUnlocked: true,
            unlockedAt: new Date(),
          })
          .where(eq(schema.userAchievement.id, existingAchievement.id))
          .run();
      } else {
        await db
          .update(schema.userAchievement)
          .set({ progress: Math.round(progress) })
          .where(eq(schema.userAchievement.id, existingAchievement.id))
          .run();
      }
    } else {
      await db
        .insert(schema.userAchievement)
        .values({
          id: crypto.randomUUID(),
          userId: userId,
          achievementId: achievement.id,
          progress: Math.round(progress),
          isUnlocked: isUnlocked,
          unlockedAt: isUnlocked ? new Date() : null,
          createdAt: new Date(),
        })
        .run();
    }
  }
}

export async function POST(event: APIEvent) {
  try {
    const env = getEnv(event);
    const db = drizzle(env.DB, { schema });
    const parsedBody = parseCLITelemetryReport(await event.request.json());
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = parsedBody.value;

    const license = await db
      .select()
      .from(schema.license)
      .where(eq(schema.license.licenseKey, body.license_key))
      .limit(1)
      .get();

    const licenseLookup = await readOptionalD1Row(
      LicenseRowSchema,
      'License row has an invalid shape',
      license
    );
    if (isInvalidD1Row(licenseLookup)) {
      return storedDataErrorResponse();
    }
    if (licenseLookup._tag === 'missing' || licenseLookup.value.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Invalid or inactive license' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const activeLicense = licenseLookup.value;

    const machine = await db
      .select()
      .from(schema.machine)
      .where(
        and(
          eq(schema.machine.licenseId, activeLicense.id),
          eq(schema.machine.machineId, body.machine_id)
        )
      )
      .limit(1)
      .get();

    const machineLookup = await readOptionalD1Row(
      MachineRowSchema,
      'Machine row has an invalid shape',
      machine
    );
    if (isInvalidD1Row(machineLookup)) {
      return storedDataErrorResponse();
    }
    const now = new Date();

    if (machineLookup._tag === 'missing') {
      const machinesLookup = await readD1RowArray(
        MachineRowSchema,
        'Machine rows have an invalid shape',
        await db
          .select()
          .from(schema.machine)
          .where(eq(schema.machine.licenseId, activeLicense.id))
          .all()
      );
      if (machinesLookup._tag === 'invalid') {
        return storedDataErrorResponse();
      }

      if (machinesLookup.value.length >= activeLicense.maxMachines) {
        return new Response(
          JSON.stringify({
            error: 'Maximum machines reached',
            current: machinesLookup.value.length,
            max: activeLicense.maxMachines,
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      await db
        .insert(schema.machine)
        .values({
          id: crypto.randomUUID(),
          licenseId: activeLicense.id,
          machineId: body.machine_id,
          hostname: body.hostname || null,
          os: body.os || null,
          arch: body.arch || null,
          omgVersion: body.omg_version || null,
          isActive: true,
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
        })
        .run();
    } else {
      const foundMachine = machineLookup.value;
      await db
        .update(schema.machine)
        .set({
          lastSeenAt: now,
          omgVersion: body.omg_version || foundMachine.omgVersion,
          hostname: body.hostname || foundMachine.hostname,
          os: body.os || foundMachine.os,
          arch: body.arch || foundMachine.arch,
          isActive: true,
        })
        .where(eq(schema.machine.id, foundMachine.id))
        .run();
    }

    const today = now.toISOString().split('T')[0];
    const existingUsageLookup = await readOptionalD1Row(
      UsageDailyRowSchema,
      'Usage daily row has an invalid shape',
      await db
        .select()
        .from(schema.usageDaily)
        .where(
          and(eq(schema.usageDaily.licenseId, activeLicense.id), eq(schema.usageDaily.date, today))
        )
        .limit(1)
        .get()
    );
    if (isInvalidD1Row(existingUsageLookup)) {
      return storedDataErrorResponse();
    }

    if (existingUsageLookup._tag === 'present') {
      const existingUsage = existingUsageLookup.value;
      await db
        .update(schema.usageDaily)
        .set({
          commandsRun: existingUsage.commandsRun + (body.commands_run || 0),
          packagesInstalled: existingUsage.packagesInstalled + (body.packages_installed || 0),
          packagesSearched: existingUsage.packagesSearched + (body.packages_searched || 0),
          runtimesSwitched: existingUsage.runtimesSwitched + (body.runtimes_switched || 0),
          sbomGenerated: existingUsage.sbomGenerated + (body.sbom_generated || 0),
          vulnerabilitiesFound:
            existingUsage.vulnerabilitiesFound + (body.vulnerabilities_found || 0),
          timeSavedMs: existingUsage.timeSavedMs + (body.time_saved_ms || 0),
          updatedAt: now,
        })
        .where(eq(schema.usageDaily.id, existingUsage.id))
        .run();
    } else {
      await db
        .insert(schema.usageDaily)
        .values({
          id: crypto.randomUUID(),
          licenseId: activeLicense.id,
          date: today,
          commandsRun: body.commands_run || 0,
          packagesInstalled: body.packages_installed || 0,
          packagesSearched: body.packages_searched || 0,
          runtimesSwitched: body.runtimes_switched || 0,
          sbomGenerated: body.sbom_generated || 0,
          vulnerabilitiesFound: body.vulnerabilities_found || 0,
          timeSavedMs: body.time_saved_ms || 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    const totalStatsLookup = await readD1RowArray(
      UsageDailyRowSchema,
      'Usage daily rows have an invalid shape',
      await db
        .select()
        .from(schema.usageDaily)
        .where(
          and(
            eq(schema.usageDaily.licenseId, activeLicense.id),
            eq(schema.usageDaily.date, dateStr)
          )
        )
        .all()
    );
    if (totalStatsLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    const stats = {
      commands_run: totalStatsLookup.value.reduce((sum, s) => sum + s.commandsRun, 0),
      packages_searched: totalStatsLookup.value.reduce((sum, s) => sum + s.packagesSearched, 0),
      packages_installed: totalStatsLookup.value.reduce((sum, s) => sum + s.packagesInstalled, 0),
      runtimes_switched: totalStatsLookup.value.reduce((sum, s) => sum + s.runtimesSwitched, 0),
      sbom_generated: totalStatsLookup.value.reduce((sum, s) => sum + s.sbomGenerated, 0),
      vulnerabilities_found: totalStatsLookup.value.reduce(
        (sum, s) => sum + s.vulnerabilitiesFound,
        0
      ),
      time_saved_ms: totalStatsLookup.value.reduce((sum, s) => sum + s.timeSavedMs, 0),
    };

    await updateAchievements(db, activeLicense.userId, stats);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[CLI Report Usage] Error:', error);
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
