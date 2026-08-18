import type { APIEvent } from '@solidjs/start/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { storedDataErrorResponse } from '~/lib/api-error';
import { isInvalidD1Row, readOptionalD1Row, UserRoleRowSchema } from '~/lib/contracts/d1-rows';

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

export async function requireAdmin(event: APIEvent) {
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
    return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { env, userId, db };
}
