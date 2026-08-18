import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { parseLicenseValidationRequest } from '~/lib/dashboard-contract';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  LicenseValidateRowSchema,
  MachineRowSchema,
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

export async function POST(event: APIEvent) {
  try {
    const env = getEnv(event);
    const db = drizzle(env.DB, { schema });
    const parsedBody = parseLicenseValidationRequest(await event.request.json());
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const licenseLookup = await readOptionalD1Row(
      LicenseValidateRowSchema,
      'License row has an invalid shape',
      await db
        .select({
          id: schema.license.id,
          tier: schema.license.tier,
          status: schema.license.status,
          maxMachines: schema.license.maxMachines,
          expiresAt: schema.license.expiresAt,
        })
        .from(schema.license)
        .where(eq(schema.license.licenseKey, parsedBody.value.license_key))
        .limit(1)
        .get()
    );
    if (isInvalidD1Row(licenseLookup)) {
      return storedDataErrorResponse();
    }
    if (licenseLookup._tag === 'missing') {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'License not found',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    const license = licenseLookup.value;

    if (license.status !== 'active') {
      return new Response(
        JSON.stringify({
          valid: false,
          error: `License is ${license.status}`,
          status: license.status,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (license.expiresAt && license.expiresAt < new Date()) {
      await db
        .update(schema.license)
        .set({ status: 'expired' })
        .where(eq(schema.license.id, license.id))
        .run();

      return new Response(
        JSON.stringify({
          valid: false,
          error: 'License has expired',
          expired_at: license.expiresAt,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const machinesLookup = await readD1RowArray(
      MachineRowSchema,
      'Machine rows have an invalid shape',
      await db.select().from(schema.machine).where(eq(schema.machine.licenseId, license.id)).all()
    );
    if (machinesLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    return new Response(
      JSON.stringify({
        valid: true,
        tier: license.tier,
        max_machines: license.maxMachines,
        current_machines: machinesLookup.value.length,
        expires_at: license.expiresAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[CLI Validate License] Error:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
