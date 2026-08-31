import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { storedDataErrorResponse } from '~/lib/api-error';
import { isInvalidD1Row, readOptionalD1Row, UserRoleRowSchema } from '~/lib/contracts/d1-rows';

function denial(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Require a valid Better Auth session whose persisted role is `admin`.
 *
 * Every expected failure — including server-side misconfiguration such as a
 * missing D1 binding — is returned as an HTTP denial Response; this function
 * never rejects, so callers handle one channel.
 *
 * @param event - The incoming SolidStart request context.
 * @returns The authorized principal and database context, or an HTTP denial response.
 */
export async function requireAdmin(event: Pick<APIEvent, 'nativeEvent' | 'request'>) {
  const cloudflareEnv = event.nativeEvent.context.cloudflare?.env;
  if (!cloudflareEnv) {
    return denial('Admin authorization unavailable', 500);
  }
  const env: CloudflareEnv = {
    DB: cloudflareEnv.DB,
    BETTER_AUTH_SECRET: cloudflareEnv.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: cloudflareEnv.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: cloudflareEnv.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: cloudflareEnv.GITHUB_CLIENT_SECRET,
  };
  const auth = createAuth(env);

  const session = await auth.api.getSession({
    headers: event.request.headers,
  });

  if (!session?.user) {
    return denial('Unauthorized', 401);
  }

  const db = drizzle(env.DB, { schema });
  const userId = session.user.id;

  const user = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1)
    .get();

  const userLookup = await readOptionalD1Row(
    UserRoleRowSchema,
    'Admin role row has an invalid shape',
    user
  );
  if (isInvalidD1Row(userLookup)) {
    return storedDataErrorResponse();
  }
  if (userLookup._tag === 'missing' || userLookup.value.role !== 'admin') {
    return denial('Forbidden: Admin access required', 403);
  }

  return { env, userId, db };
}
