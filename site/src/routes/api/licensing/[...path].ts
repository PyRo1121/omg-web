import type { APIEvent } from '@solidjs/start/server';
import { Cause, Effect, Exit, Option } from 'effect';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/auth-schema';
import { createAuth, type CloudflareEnv } from '~/lib/auth';
import {
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
  constructor(readonly cause?: unknown) {
    super('Licensing identity store unavailable');
  }
}

type LicensingRouteError =
  | LicensingUnauthorized
  | LicensingBffMisconfigured
  | LicensingIdentityStoreUnavailable
  | LicensingBffError;

function authEnvFrom(cloudflareEnv: CloudflareEnv): CloudflareEnv {
  return {
    DB: cloudflareEnv.DB,
    BETTER_AUTH_KV: cloudflareEnv.BETTER_AUTH_KV,
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
): Effect.Effect<LicensingIdentity, LicensingUnauthorized | LicensingIdentityStoreUnavailable> {
  return Effect.gen(function* () {
    const authEnv = authEnvFrom(cloudflareEnv);
    const session = yield* Effect.tryPromise({
      try: () => createAuth(authEnv).api.getSession({ headers: request.headers }),
      catch: cause => new LicensingIdentityStoreUnavailable(cause),
    });
    if (session?.user === undefined) {
      return yield* Effect.fail(new LicensingUnauthorized());
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

function statusFor(error: LicensingRouteError): number {
  switch (error._tag) {
    case 'LicensingUnauthorized':
      return 401;
    case 'LicensingSameOriginRequired':
      return 403;
    case 'LicensingRouteRejected':
      return 404;
    case 'LicensingBodyTooLarge':
      return 413;
    case 'LicensingWorkerRejected':
      return 502;
    case 'LicensingBffMisconfigured':
    case 'LicensingIdentityStoreUnavailable':
    case 'LicensingBffParseError':
    case 'LicensingServiceUnavailable':
    case 'LicensingBodyReadError':
      return 500;
    default:
      return casesHandled(error);
  }
}

function safeMessage(error: LicensingRouteError): string {
  switch (error._tag) {
    case 'LicensingUnauthorized':
    case 'LicensingSameOriginRequired':
    case 'LicensingRouteRejected':
    case 'LicensingBodyTooLarge':
      return error.message;
    case 'LicensingBffMisconfigured':
    case 'LicensingIdentityStoreUnavailable':
    case 'LicensingBffParseError':
    case 'LicensingServiceUnavailable':
    case 'LicensingBodyReadError':
    case 'LicensingWorkerRejected':
      return 'Licensing request failed';
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
      return Response.json({ error: safeMessage(error) }, { status: statusFor(error) });
    },
  });
}

async function handle(event: APIEvent): Promise<Response> {
  return responseFromExit(await Effect.runPromiseExit(proxyFromEvent(event)));
}

export async function GET(event: APIEvent): Promise<Response> {
  return handle(event);
}

export async function POST(event: APIEvent): Promise<Response> {
  return handle(event);
}

export async function PUT(event: APIEvent): Promise<Response> {
  return handle(event);
}

export async function PATCH(event: APIEvent): Promise<Response> {
  return handle(event);
}

export async function DELETE(event: APIEvent): Promise<Response> {
  return handle(event);
}
