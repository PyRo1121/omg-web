import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, gte, lte, and, sql } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { internalErrorResponse, storedDataErrorResponse } from '~/lib/api-error';
import {
  CommandHistoryRowSchema,
  CommandNameRowSchema,
  CountRowSchema,
  LicenseRowSchema,
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

export interface CommandHistoryItem {
  id: string;
  command: string;
  packageName: string | null;
  runtimeName: string | null;
  success: boolean;
  durationMs: number | null;
  createdAt: string;
  machineHostname: string | null;
}

export interface CommandHistoryResponse {
  commands: CommandHistoryItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  filters: {
    availableCommands: string[];
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const commandFilter = url.searchParams.get('command');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const successFilter = url.searchParams.get('success');

    const conditions = [eq(schema.commandUsage.licenseId, licenseId)];

    if (commandFilter) {
      conditions.push(eq(schema.commandUsage.command, commandFilter));
    }

    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (!Number.isNaN(parsedStartDate.getTime())) {
        conditions.push(gte(schema.commandUsage.createdAt, parsedStartDate));
      }
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate);
      if (!Number.isNaN(parsedEndDate.getTime())) {
        parsedEndDate.setDate(parsedEndDate.getDate() + 1);
        conditions.push(lte(schema.commandUsage.createdAt, parsedEndDate));
      }
    }

    if (successFilter !== null && successFilter !== undefined) {
      conditions.push(eq(schema.commandUsage.success, successFilter === 'true'));
    }

    const totalLookup = await readOptionalD1Row(
      CountRowSchema,
      'Command history count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.commandUsage)
        .where(and(...conditions))
        .get()
    );
    if (isInvalidD1Row(totalLookup)) {
      return storedDataErrorResponse();
    }
    const total = optionalD1RowValue(totalLookup)?.count ?? 0;

    const commandsLookup = await readD1RowArray(
      CommandHistoryRowSchema,
      'Command history rows have an invalid shape',
      await db
        .select({
          id: schema.commandUsage.id,
          command: schema.commandUsage.command,
          packageName: schema.commandUsage.packageName,
          runtimeName: schema.commandUsage.runtimeName,
          success: schema.commandUsage.success,
          durationMs: schema.commandUsage.durationMs,
          createdAt: schema.commandUsage.createdAt,
        })
        .from(schema.commandUsage)
        .where(and(...conditions))
        .orderBy(desc(schema.commandUsage.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    );
    if (commandsLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    const availableCommandsLookup = await readD1RowArray(
      CommandNameRowSchema,
      'Available command rows have an invalid shape',
      await db
        .select({ command: schema.commandUsage.command })
        .from(schema.commandUsage)
        .where(eq(schema.commandUsage.licenseId, licenseId))
        .groupBy(schema.commandUsage.command)
        .all()
    );
    if (availableCommandsLookup._tag === 'invalid') {
      return storedDataErrorResponse();
    }

    const response: CommandHistoryResponse = {
      commands: commandsLookup.value.map(c => ({
        id: c.id,
        command: c.command,
        packageName: c.packageName ?? null,
        runtimeName: c.runtimeName ?? null,
        success: c.success,
        durationMs: c.durationMs ?? null,
        createdAt: c.createdAt.toISOString(),
        machineHostname: null,
      })),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
      filters: {
        availableCommands: availableCommandsLookup.value.map(c => c.command),
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    console.error('[Command History API] Error:', error);
    return internalErrorResponse();
  }
}
