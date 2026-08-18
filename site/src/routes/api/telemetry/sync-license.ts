import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { parseExternalLicenseResponse } from '~/lib/dashboard-contract';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  IdRowSchema,
  LicenseRowSchema,
  isInvalidD1Row,
  readOptionalD1Row,
} from '~/lib/contracts/d1-rows';

type LicenseTier = 'free' | 'team' | 'enterprise';

function parseLicenseTier(value: string | undefined): LicenseTier {
  switch (value) {
    case 'team':
    case 'enterprise':
      return value;
    default:
      return 'free';
  }
}

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

/**
 * Sync license tier from external API (api.pyro1121.com) to D1 database
 * This endpoint is called automatically by the dashboard to ensure tier is up-to-date
 */
export async function POST(event: APIEvent) {
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

    console.log('[Sync License] Querying license for userId:', userId);

    const licenseLookup = await readOptionalD1Row(
      LicenseRowSchema,
      'License row has an invalid shape',
      await db.select().from(schema.license).where(eq(schema.license.userId, userId)).limit(1).get()
    );
    if (isInvalidD1Row(licenseLookup)) {
      return storedDataErrorResponse();
    }

    console.log(
      '[Sync License] License found:',
      licenseLookup._tag === 'present'
        ? `id=${licenseLookup.value.id}, tier=${licenseLookup.value.tier}, licenseKey=${licenseLookup.value.licenseKey}`
        : 'null'
    );

    if (licenseLookup._tag === 'missing') {
      return new Response(JSON.stringify({ error: 'No license found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const license = licenseLookup.value;

    const externalApiResponse = await fetch('https://api.pyro1121.com/api/validate-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: license.licenseKey,
      }),
    });

    if (!externalApiResponse.ok) {
      console.error('[Sync License] External API error:', externalApiResponse.status);
      return new Response(
        JSON.stringify({
          error: 'Failed to validate with external API',
          synced: false,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const parsedExternalData = parseExternalLicenseResponse(await externalApiResponse.json());
    if (!parsedExternalData.ok) {
      console.error('[Sync License] Invalid external API response:', parsedExternalData.error);
      return new Response(
        JSON.stringify({ error: 'Invalid external API response', synced: false }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    const externalData = parsedExternalData.value;

    console.log('[Sync License] External API response:', {
      valid: externalData.valid,
      tier: externalData.tier,
      max_machines: externalData.max_machines,
    });

    if (!externalData.valid) {
      return new Response(
        JSON.stringify({
          error: 'License is not valid',
          synced: false,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const newTier = parseLicenseTier(externalData.tier);
    const maxMachines = externalData.max_machines || license.maxMachines;

    console.log('[Sync License] Comparing - DB tier:', license.tier, 'vs External tier:', newTier);

    if (license.tier !== newTier || license.maxMachines !== maxMachines) {
      console.log(
        '[Sync License] Updating database: old_tier =',
        license.tier,
        ', new_tier =',
        newTier
      );

      await db
        .update(schema.license)
        .set({
          tier: newTier,
          maxMachines: maxMachines,
          updatedAt: new Date(),
        })
        .where(eq(schema.license.id, license.id))
        .run();

      console.log('[Sync License] Database updated successfully');

      const extras = await syncExternalRecords(
        db,
        license.id,
        externalData.machines,
        externalData.usage
      );
      if (extras._tag === 'invalid') {
        return storedDataErrorResponse();
      }

      return new Response(
        JSON.stringify({
          synced: true,
          old_tier: license.tier,
          new_tier: newTier,
          max_machines: maxMachines,
          machines_synced: extras.machines,
          usage_synced: extras.usage,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[Sync License] No update needed - tiers match');

    const extras = await syncExternalRecords(
      db,
      license.id,
      externalData.machines,
      externalData.usage
    );
    if (extras._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    return new Response(
      JSON.stringify({
        synced: true,
        message: 'Already up to date',
        tier: newTier,
        machines_synced: extras.machines,
        usage_synced: extras.usage,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('[Sync License] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        synced: false,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

type StoredRowSync = { readonly _tag: 'ok'; readonly count: number } | { readonly _tag: 'invalid' };

type ExternalRecordSync =
  | { readonly _tag: 'ok'; readonly machines: number; readonly usage: number }
  | { readonly _tag: 'invalid' };

async function syncExternalRecords(
  db: ReturnType<typeof drizzle>,
  licenseId: string,
  machines:
    | ReadonlyArray<{
        machine_id: string;
        hostname?: string;
        os?: string;
        arch?: string;
        omg_version?: string;
        is_active: number;
        first_seen_at?: string;
        last_seen_at?: string;
      }>
    | undefined,
  usage:
    | ReadonlyArray<{
        date: string;
        commands_run: number;
        packages_installed: number;
        packages_searched: number;
        runtimes_switched: number;
        sbom_generated: number;
        vulnerabilities_found: number;
        time_saved_ms: number;
      }>
    | undefined
): Promise<ExternalRecordSync> {
  const machinesSynced = await syncMachines(db, licenseId, machines);
  if (machinesSynced._tag === 'invalid') {
    return { _tag: 'invalid' };
  }
  const usageSynced = await syncUsage(db, licenseId, usage);
  if (usageSynced._tag === 'invalid') {
    return { _tag: 'invalid' };
  }
  return { _tag: 'ok', machines: machinesSynced.count, usage: usageSynced.count };
}

/**
 * Sync machines from the external API (omg-licensing) to auth-db
 * Uses upsert logic: insert new machines, update existing ones
 */
async function syncMachines(
  db: ReturnType<typeof drizzle>,
  licenseId: string,
  machines?: ReadonlyArray<{
    machine_id: string;
    hostname?: string;
    os?: string;
    arch?: string;
    omg_version?: string;
    is_active: number;
    first_seen_at?: string;
    last_seen_at?: string;
  }>
): Promise<StoredRowSync> {
  if (!machines || machines.length === 0) {
    return { _tag: 'ok', count: 0 };
  }

  let synced = 0;

  for (const m of machines) {
    const existing = await db
      .select({ id: schema.machine.id })
      .from(schema.machine)
      .where(
        and(eq(schema.machine.licenseId, licenseId), eq(schema.machine.machineId, m.machine_id))
      )
      .limit(1)
      .get();

    const existingLookup = await readOptionalD1Row(
      IdRowSchema,
      'Machine id row has an invalid shape',
      existing
    );
    if (isInvalidD1Row(existingLookup)) {
      return { _tag: 'invalid' };
    }

    const now = new Date();
    const firstSeen = m.first_seen_at ? new Date(m.first_seen_at) : now;
    const lastSeen = m.last_seen_at ? new Date(m.last_seen_at) : now;

    if (existingLookup._tag === 'present') {
      await db
        .update(schema.machine)
        .set({
          hostname: m.hostname || null,
          os: m.os || null,
          arch: m.arch || null,
          omgVersion: m.omg_version || null,
          isActive: m.is_active === 1,
          lastSeenAt: lastSeen,
        })
        .where(eq(schema.machine.id, existingLookup.value.id))
        .run();
    } else {
      await db
        .insert(schema.machine)
        .values({
          id: crypto.randomUUID(),
          licenseId,
          machineId: m.machine_id,
          hostname: m.hostname || null,
          os: m.os || null,
          arch: m.arch || null,
          omgVersion: m.omg_version || null,
          isActive: m.is_active === 1,
          firstSeenAt: firstSeen,
          lastSeenAt: lastSeen,
        })
        .run();
    }
    synced++;
  }

  console.log(`[Sync Machines] Synced ${synced}/${machines.length} machines`);
  return { _tag: 'ok', count: synced };
}

/**
 * Sync usage data from the external API (omg-licensing) to auth-db
 * Uses upsert logic: insert new days, replace existing ones
 */
async function syncUsage(
  db: ReturnType<typeof drizzle>,
  licenseId: string,
  usage?: ReadonlyArray<{
    date: string;
    commands_run: number;
    packages_installed: number;
    packages_searched: number;
    runtimes_switched: number;
    sbom_generated: number;
    vulnerabilities_found: number;
    time_saved_ms: number;
  }>
): Promise<StoredRowSync> {
  if (!usage || usage.length === 0) {
    return { _tag: 'ok', count: 0 };
  }

  let synced = 0;

  for (const day of usage) {
    const existing = await db
      .select({ id: schema.usageDaily.id })
      .from(schema.usageDaily)
      .where(and(eq(schema.usageDaily.licenseId, licenseId), eq(schema.usageDaily.date, day.date)))
      .limit(1)
      .get();

    const existingLookup = await readOptionalD1Row(
      IdRowSchema,
      'Usage daily id row has an invalid shape',
      existing
    );
    if (isInvalidD1Row(existingLookup)) {
      return { _tag: 'invalid' };
    }

    if (existingLookup._tag === 'present') {
      await db
        .update(schema.usageDaily)
        .set({
          commandsRun: day.commands_run || 0,
          packagesInstalled: day.packages_installed || 0,
          packagesSearched: day.packages_searched || 0,
          runtimesSwitched: day.runtimes_switched || 0,
          sbomGenerated: day.sbom_generated || 0,
          vulnerabilitiesFound: day.vulnerabilities_found || 0,
          timeSavedMs: day.time_saved_ms || 0,
        })
        .where(eq(schema.usageDaily.id, existingLookup.value.id))
        .run();
    } else {
      await db
        .insert(schema.usageDaily)
        .values({
          id: crypto.randomUUID(),
          licenseId,
          date: day.date,
          commandsRun: day.commands_run || 0,
          packagesInstalled: day.packages_installed || 0,
          packagesSearched: day.packages_searched || 0,
          runtimesSwitched: day.runtimes_switched || 0,
          sbomGenerated: day.sbom_generated || 0,
          vulnerabilitiesFound: day.vulnerabilities_found || 0,
          timeSavedMs: day.time_saved_ms || 0,
        })
        .run();
    }
    synced++;
  }

  console.log(`[Sync Usage] Synced ${synced}/${usage.length} usage days`);
  return { _tag: 'ok', count: synced };
}
