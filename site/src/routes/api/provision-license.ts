import type { APIEvent } from '@solidjs/start/server';
import { Effect } from 'effect';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import {
  AuthBridgeMisconfigured,
  AuthBridgeStoreUnavailable,
  AuthBridgeUnauthorized,
} from '~/lib/admin-session-bridge';
import {
  FetchWorkerProvisionPoster,
  provisionLicenseForUser,
  responseFromProvisionLicenseExit,
  type ProvisionLicenseError,
} from '~/lib/provision-license';
import type { ProvisionResponse } from '~/lib/contracts/provision';

function provisionFromEvent(
  event: APIEvent
): Effect.Effect<ProvisionResponse, ProvisionLicenseError> {
  return Effect.gen(function* () {
    const cloudflareEnv = event.nativeEvent.context.cloudflare?.env;
    if (cloudflareEnv === undefined) {
      return yield* Effect.fail(new AuthBridgeMisconfigured('cloudflare_env'));
    }
    const authEnv: CloudflareEnv = {
      DB: cloudflareEnv.DB,
      BETTER_AUTH_KV: cloudflareEnv.BETTER_AUTH_KV,
      BETTER_AUTH_SECRET: cloudflareEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: cloudflareEnv.BETTER_AUTH_URL,
      GITHUB_CLIENT_ID: cloudflareEnv.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: cloudflareEnv.GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: cloudflareEnv.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: cloudflareEnv.GOOGLE_CLIENT_SECRET,
      WORKERS_API_URL: cloudflareEnv.WORKERS_API_URL,
      ADMIN_API_SECRET: cloudflareEnv.ADMIN_API_SECRET,
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
    return yield* provisionLicenseForUser(
      { email: session.user.email, name: session.user.name },
      cloudflareEnv.WORKERS_API_URL,
      cloudflareEnv.ADMIN_API_SECRET,
      new FetchWorkerProvisionPoster()
    );
  });
}

export async function POST(event: APIEvent) {
  const exit = await Effect.runPromiseExit(provisionFromEvent(event));
  return responseFromProvisionLicenseExit(exit);
}
