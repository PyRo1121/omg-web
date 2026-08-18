import type { APIEvent } from '@solidjs/start/server';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '~/db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import {
  AdminSessionBridge,
  AuthBridgeMisconfigured,
  AuthBridgeStoreUnavailable,
  AuthBridgeUnauthorized,
  FetchWorkerSessionPoster,
  parseAdminApiSecret,
  parseWorkersApiUrl,
  responseFromAuthBridgeExit,
  type AdminRoleLookup,
  type AuthBridgeError,
} from '~/lib/admin-session-bridge';
import type { AdminSessionClientResponse } from '~/lib/contracts/admin-session';
import { isInvalidD1Row, readOptionalD1Row, UserRoleRowSchema } from '~/lib/contracts/d1-rows';

function drizzleRoleLookup(db: ReturnType<typeof drizzle<typeof schema>>): AdminRoleLookup {
  return {
    lookupRole(userId: string) {
      return Effect.tryPromise({
        try: async () => {
          const userRecord = await db
            .select({ role: schema.user.role })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1)
            .get();
          const userLookup = await readOptionalD1Row(
            UserRoleRowSchema,
            'Admin role row has an invalid shape',
            userRecord
          );
          if (isInvalidD1Row(userLookup)) {
            throw new AuthBridgeStoreUnavailable('invalid role row');
          }
          if (userLookup._tag === 'missing') {
            return null;
          }
          return userLookup.value.role === 'admin' ? 'admin' : 'user';
        },
        catch: (cause: unknown) =>
          cause instanceof AuthBridgeStoreUnavailable
            ? cause
            : new AuthBridgeStoreUnavailable(cause),
      });
    },
  };
}

function mintFromEvent(
  event: APIEvent
): Effect.Effect<AdminSessionClientResponse, AuthBridgeError> {
  return Effect.gen(function* () {
    const cloudflareEnv = event.nativeEvent.context.cloudflare?.env;
    if (cloudflareEnv === undefined) {
      return yield* Effect.fail(new AuthBridgeMisconfigured('cloudflare_env'));
    }
    const workersApiUrl = yield* parseWorkersApiUrl(cloudflareEnv.WORKERS_API_URL);
    const adminSecret = yield* parseAdminApiSecret(cloudflareEnv.ADMIN_API_SECRET);
    const authEnv: CloudflareEnv = {
      DB: cloudflareEnv.DB,
      BETTER_AUTH_KV: cloudflareEnv.BETTER_AUTH_KV,
      BETTER_AUTH_SECRET: cloudflareEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: cloudflareEnv.BETTER_AUTH_URL,
      GITHUB_CLIENT_ID: cloudflareEnv.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: cloudflareEnv.GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: cloudflareEnv.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: cloudflareEnv.GOOGLE_CLIENT_SECRET,
    };
    const session = yield* Effect.tryPromise({
      try: () =>
        createAuth(authEnv).api.getSession({
          headers: event.request.headers,
        }),
      catch: cause => new AuthBridgeStoreUnavailable(cause),
    });
    if (session?.user === undefined) {
      return yield* Effect.fail(new AuthBridgeUnauthorized());
    }
    const user = session.user;
    const db = drizzle(authEnv.DB, { schema });
    const bridge = new AdminSessionBridge(
      drizzleRoleLookup(db),
      new FetchWorkerSessionPoster(),
      workersApiUrl,
      adminSecret
    );
    return yield* bridge.mint({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });
}

export async function GET(event: APIEvent) {
  const exit = await Effect.runPromiseExit(mintFromEvent(event));
  return responseFromAuthBridgeExit(exit);
}
