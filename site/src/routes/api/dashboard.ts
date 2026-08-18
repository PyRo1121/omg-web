import type { APIEvent } from '@solidjs/start/server';
import { Effect, Exit } from 'effect';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { parseAccountDashboard } from '~/lib/contracts/dashboard';

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

export async function GET(event: APIEvent) {
  const env = readCloudflareEnv(event);
  if (env === null) {
    console.error('Dashboard API: Cloudflare environment not available');
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
    const currentSessionToken = session.session.token;

    const userSessions = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, session.user.id))
      .all();

    const userAccounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, session.user.id))
      .all();

    const response = {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image || null,
        createdAt: new Date(session.user.createdAt).toISOString(),
      },
      sessions: userSessions.map(s => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: new Date(s.createdAt).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString(),
        isCurrent: s.token === currentSessionToken,
      })),
      accounts: userAccounts.map(a => ({
        provider: a.providerId,
        accountId: a.accountId,
      })),
    };

    const encoded = await Effect.runPromiseExit(parseAccountDashboard(response));
    return Exit.match(encoded, {
      onFailure: cause => {
        console.error('Dashboard API: outbound payload failed schema encode', cause);
        return internalErrorResponse();
      },
      onSuccess: payload =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
  } catch (error: unknown) {
    console.error('Dashboard API error:', error);
    return internalErrorResponse();
  }
}
