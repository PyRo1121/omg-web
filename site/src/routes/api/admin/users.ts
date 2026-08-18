import type { APIEvent } from '@solidjs/start/server';
import { sql, desc, eq } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  AdminUserListRowSchema,
  AdminUserUsageRowSchema,
  CountRowSchema,
  LicenseRowSchema,
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
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const usersLookup = await readD1RowArray(
      AdminUserListRowSchema,
      'Admin user rows have an invalid shape',
      await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          role: schema.user.role,
          emailVerified: schema.user.emailVerified,
          createdAt: schema.user.createdAt,
          updatedAt: schema.user.updatedAt,
        })
        .from(schema.user)
        .orderBy(desc(schema.user.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    );
    if (usersLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    const usersWithLicenses = [];
    for (const user of usersLookup.value) {
      const licenseLookup = await readOptionalD1Row(
        LicenseRowSchema,
        'License row has an invalid shape',
        await db
          .select()
          .from(schema.license)
          .where(eq(schema.license.userId, user.id))
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(licenseLookup)) {
        return storedDataErrorResponse();
      }
      const license = optionalD1RowValue(licenseLookup);

      let machineCount = 0;
      let totalCommands = 0;
      let totalPackages = 0;
      if (license !== undefined) {
        const machineCountLookup = await readOptionalD1Row(
          CountRowSchema,
          'Machine count has an invalid shape',
          await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(schema.machine)
            .where(eq(schema.machine.licenseId, license.id))
            .get()
        );
        const usageLookup = await readOptionalD1Row(
          AdminUserUsageRowSchema,
          'User usage totals have an invalid shape',
          await db
            .select({
              totalCommands: sql<number>`COALESCE(SUM(${schema.usageDaily.commandsRun}), 0)`,
              totalPackages: sql<number>`COALESCE(SUM(${schema.usageDaily.packagesInstalled}), 0)`,
            })
            .from(schema.usageDaily)
            .where(eq(schema.usageDaily.licenseId, license.id))
            .get()
        );
        if (isInvalidD1Row(machineCountLookup) || isInvalidD1Row(usageLookup)) {
          return storedDataErrorResponse();
        }
        machineCount = optionalD1RowValue(machineCountLookup)?.count ?? 0;
        totalCommands = optionalD1RowValue(usageLookup)?.totalCommands ?? 0;
        totalPackages = optionalD1RowValue(usageLookup)?.totalPackages ?? 0;
      }

      usersWithLicenses.push({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        license: license
          ? {
              id: license.id,
              key: license.licenseKey,
              tier: license.tier,
              status: license.status,
              maxMachines: license.maxMachines,
              expiresAt: license.expiresAt?.toISOString() || null,
            }
          : null,
        machines: machineCount,
        totalCommands,
        totalPackages,
      });
    }

    const totalCountLookup = await readOptionalD1Row(
      CountRowSchema,
      'User total count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.user)
        .get()
    );
    if (isInvalidD1Row(totalCountLookup)) {
      return storedDataErrorResponse();
    }
    const total = optionalD1RowValue(totalCountLookup)?.count ?? 0;

    return new Response(
      JSON.stringify({
        users: usersWithLicenses,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
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
    console.error('[Admin Users API] Error:', error);
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
