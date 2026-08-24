import type { APIEvent } from '@solidjs/start/server';
import { Cause, Effect, Exit, Option } from 'effect';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import {
  LicensingEmailVerificationRequired,
  proxyLicensingRequest,
  type LicensingBffError,
  type LicensingIdentity,
} from '~/lib/licensing-bff';
import { isInvalidD1Row, readOptionalD1Row, UserRoleRowSchema } from '~/lib/contracts/d1-rows';
import { casesHandled } from '~/lib/prelude';

class LicensingUnauthorized extends Error {
  readonly _tag = 'LicensingUnauthorized';
  constructor() {
    super('Unauthorized');
  }
}

class LicensingBffMisconfigured extends Error {
  readonly _tag = 'LicensingBffMisconfigured';
  constructor() {
    super('Licensing BFF is not configured');
  }
}

class LicensingIdentityStoreUnavailable extends Error {
  readonly _tag = 'LicensingIdentityStoreUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Licensing identity store unavailable');
  }
}

type LicensingRouteError =
  | LicensingUnauthorized
  | LicensingBffMisconfigured
  | LicensingEmailVerificationRequired
  | LicensingIdentityStoreUnavailable
  | LicensingBffError;

function authEnvFrom(cloudflareEnv: CloudflareEnv): CloudflareEnv {
  return {
    DB: cloudflareEnv.DB,
    BETTER_AUTH_SECRET: cloudflareEnv.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: cloudflareEnv.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: cloudflareEnv.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: cloudflareEnv.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: cloudflareEnv.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: cloudflareEnv.GOOGLE_CLIENT_SECRET,
  };
}

function licensingIdentity(
  cloudflareEnv: CloudflareEnv,
  request: Request
): Effect.Effect<
  LicensingIdentity,
  LicensingUnauthorized | LicensingEmailVerificationRequired | LicensingIdentityStoreUnavailable
> {
  return Effect.gen(function* () {
    const authEnv = authEnvFrom(cloudflareEnv);
    const session = yield* Effect.tryPromise({
      try: () => createAuth(authEnv).api.getSession({ headers: request.headers }),
      catch: cause => new LicensingIdentityStoreUnavailable(cause),
    });
    if (session?.user === undefined) {
      return yield* Effect.fail(new LicensingUnauthorized());
    }
    if (session.user.emailVerified !== true) {
      return yield* Effect.fail(new LicensingEmailVerificationRequired());
    }

    const db = drizzle(authEnv.DB, { schema });
    const row = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ role: schema.user.role })
          .from(schema.user)
          .where(eq(schema.user.id, session.user.id))
          .limit(1)
          .get(),
      catch: cause => new LicensingIdentityStoreUnavailable(cause),
    });
    const roleLookup = yield* Effect.tryPromise({
      try: () => readOptionalD1Row(UserRoleRowSchema, 'User role row has an invalid shape', row),
      catch: cause => new LicensingIdentityStoreUnavailable(cause),
    });
    if (isInvalidD1Row(roleLookup)) {
      return yield* Effect.fail(new LicensingIdentityStoreUnavailable('invalid user role row'));
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: roleLookup._tag === 'present' && roleLookup.value.role === 'admin' ? 'admin' : 'user',
      emailVerified: session.user.emailVerified,
    };
  });
}

function proxyFromEvent(event: APIEvent): Effect.Effect<Response, LicensingRouteError> {
  return Effect.gen(function* () {
    const cloudflareEnv = event.nativeEvent.context.cloudflare?.env;
    if (
      cloudflareEnv === undefined ||
      cloudflareEnv.LICENSING_API === undefined ||
      cloudflareEnv.ADMIN_API_SECRET === undefined
    ) {
      return yield* Effect.fail(new LicensingBffMisconfigured());
    }
    const identity = yield* licensingIdentity(cloudflareEnv, event.request);
    return yield* proxyLicensingRequest(
      event.request,
      identity,
      cloudflareEnv.ADMIN_API_SECRET,
      cloudflareEnv.LICENSING_API
    );
  });
}

interface RouteErrorResponse {
  status: number;
  message: string;
}

/** Maps each failure to its HTTP status and client-safe message in one place. */
function errorResponse(error: LicensingRouteError): RouteErrorResponse {
  switch (error._tag) {
    // Client-facing rejections expose their descriptive message.
    case 'LicensingUnauthorized':
      return { status: 401, message: error.message };
    case 'LicensingSameOriginRequired':
    case 'LicensingEmailVerificationRequired':
      return { status: 403, message: error.message };
    case 'LicensingRouteRejected':
      return { status: 404, message: error.message };
    case 'LicensingBodyTooLarge':
      return { status: 413, message: error.message };
    case 'LicensingWorkerRejected':
      return { status: 502, message: 'Licensing request failed' };
    // Misconfiguration and infrastructure failures stay opaque.
    case 'LicensingBffMisconfigured':
    case 'LicensingIdentityStoreUnavailable':
    case 'LicensingBffParseError':
    case 'LicensingServiceUnavailable':
    case 'LicensingBodyReadError':
      return { status: 500, message: 'Licensing request failed' };
    default:
      return casesHandled(error);
  }
}

function responseFromExit(exit: Exit.Exit<Response, LicensingRouteError>): Response {
  return Exit.match(exit, {
    onSuccess: response => response,
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        return Response.json({ error: 'Licensing request failed' }, { status: 500 });
      }
      const error = failure.value;
      const { status, message } = errorResponse(error);
      return Response.json({ error: message }, { status });
    },
  });
}

async function handle(event: APIEvent): Promise<Response> {
  return responseFromExit(await Effect.runPromiseExit(proxyFromEvent(event)));
}

export function GET(event: APIEvent): Promise<Response> {
  return handle(event);
}

export function POST(event: APIEvent): Promise<Response> {
  return handle(event);
}

export function PUT(event: APIEvent): Promise<Response> {
  return handle(event);
}

export function PATCH(event: APIEvent): Promise<Response> {
  return handle(event);
}

export function DELETE(event: APIEvent): Promise<Response> {
  return handle(event);
}
