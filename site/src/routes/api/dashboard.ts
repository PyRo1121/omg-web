import type { APIEvent } from '@solidjs/start/server';
import * as Sentry from '@sentry/solid';
import { Cause, Effect, Exit, Option } from 'effect';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import { parseAccountDashboard, type DashboardData } from '~/lib/contracts/dashboard';
import { AccountRowSchema, SessionRowSchema, readD1RowArray } from '~/lib/contracts/d1-rows';
import { casesHandled } from '~/lib/prelude';

class DashboardUnauthorized extends Error {
  readonly _tag = 'DashboardUnauthorized';
  constructor() {
    super('Dashboard authorization required');
  }
}

class DashboardUnavailable extends Error {
  readonly _tag = 'DashboardUnavailable';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Dashboard unavailable during ${operation}`);
  }
}

class DashboardStoredDataInvalid extends Error {
  readonly _tag = 'DashboardStoredDataInvalid';
  constructor() {
    super('Dashboard persisted data has an invalid shape');
  }
}

class DashboardOutboundPayloadInvalid extends Error {
  readonly _tag = 'DashboardOutboundPayloadInvalid';
  constructor(override readonly cause?: unknown) {
    super('Dashboard response has an invalid shape');
  }
}

type DashboardRouteError =
  | DashboardUnauthorized
  | DashboardUnavailable
  | DashboardStoredDataInvalid
  | DashboardOutboundPayloadInvalid;

type DashboardHttpBody = DashboardData | { readonly error: string };

function jsonResponse(body: DashboardHttpBody, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function readCloudflareEnv(event: APIEvent): CloudflareEnv | null {
  const env = event.nativeEvent.context.cloudflare?.env;
  if (!env) {
    return null;
  }

  return {
    DB: env.DB,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  };
}

function loadDashboard(
  request: Request,
  env: CloudflareEnv
): Effect.Effect<DashboardData, DashboardRouteError> {
  return Effect.gen(function* () {
    const auth = createAuth(env);
    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: request.headers }),
      catch: cause => new DashboardUnavailable('readSession', cause),
    });
    if (session?.user === undefined) {
      return yield* Effect.fail(new DashboardUnauthorized());
    }

    const db = drizzle(env.DB, { schema });
    const [userSessions, userAccounts] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          db.select().from(schema.session).where(eq(schema.session.userId, session.user.id)).all(),
          db.select().from(schema.account).where(eq(schema.account.userId, session.user.id)).all(),
        ]),
      catch: cause => new DashboardUnavailable('readDashboardRows', cause),
    });

    const [sessionsLookup, accountsLookup] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          readD1RowArray(SessionRowSchema, 'Session rows have an invalid shape', userSessions),
          readD1RowArray(AccountRowSchema, 'Account rows have an invalid shape', userAccounts),
        ]),
      catch: cause => new DashboardUnavailable('decodeDashboardRows', cause),
    });
    if (sessionsLookup._tag === 'invalid' || accountsLookup._tag === 'invalid') {
      return yield* Effect.fail(new DashboardStoredDataInvalid());
    }

    const response = {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
        createdAt: new Date(session.user.createdAt).toISOString(),
      },
      sessions: sessionsLookup.value.map(item => ({
        id: item.id,
        ipAddress: item.ipAddress ?? null,
        userAgent: item.userAgent ?? null,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        isCurrent: item.token === session.session.token,
      })),
      accounts: accountsLookup.value.map(item => ({
        provider: item.providerId,
        accountId: item.accountId,
      })),
    };

    return yield* parseAccountDashboard(response).pipe(
      Effect.mapError(cause => new DashboardOutboundPayloadInvalid(cause))
    );
  });
}

function responseFromExit(exit: Exit.Exit<DashboardData, DashboardRouteError>): Response {
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload, 200),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        Sentry.captureException(Cause.pretty(cause));
        return jsonResponse({ error: 'Internal server error' }, 500);
      }

      const error = failure.value;
      switch (error._tag) {
        case 'DashboardUnauthorized':
          return jsonResponse({ error: 'Unauthorized' }, 401);
        case 'DashboardStoredDataInvalid':
        case 'DashboardOutboundPayloadInvalid':
        case 'DashboardUnavailable':
          Sentry.captureException(error);
          return jsonResponse({ error: 'Internal server error' }, 500);
        default:
          return casesHandled(error);
      }
    },
  });
}

export async function GET(event: APIEvent): Promise<Response> {
  const env = readCloudflareEnv(event);
  if (env === null) {
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
  return responseFromExit(await Effect.runPromiseExit(loadDashboard(event.request, env)));
}
