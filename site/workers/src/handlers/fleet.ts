import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import { type Env, jsonResponse, errorResponse, validateSession, getAuthToken } from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import { casesHandled } from '../prelude';
import { SessionUnauthorizedError } from '../admin-auth';

/** Fleet push requires a Team or Enterprise license. */
export class FleetForbiddenError extends Error {
  readonly _tag = 'FleetForbiddenError';
}

/** D1 was unavailable while processing a fleet push. */
export class FleetStoreUnavailable extends Error {
  readonly _tag = 'FleetStoreUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Failed to process fleet push');
  }
}

const FleetPushRequestSchema = Schema.Struct({
  team: Schema.String.pipe(Schema.minLength(1)),
  message: Schema.String,
  lock_content: Schema.String.pipe(Schema.minLength(1)),
  machine_count: Schema.Number,
});

const FleetLicenseRowSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
});

type FleetError =
  SessionUnauthorizedError | FleetForbiddenError | InvalidJsonBodyError | FleetStoreUnavailable;

function requireSession(request: Request, env: Env) {
  const token = getAuthToken(request);
  if (token === null || token.length === 0) {
    return Effect.fail(new SessionUnauthorizedError());
  }
  return Effect.tryPromise({
    try: () => validateSession(env.DB, token),
    catch: cause => new FleetStoreUnavailable(cause),
  }).pipe(
    Effect.flatMap(auth =>
      auth === null ? Effect.fail(new SessionUnauthorizedError()) : Effect.succeed(auth)
    )
  );
}

/**
 * Store a fleet lock push for a Team/Enterprise license.
 *
 * @param request - Incoming POST with JSON body.
 * @param env - Worker bindings.
 * @returns A success payload, or a tagged fleet error.
 */
export function pushFleetLock(
  request: Request,
  env: Env
): Effect.Effect<{ success: true; pushed_at: string; version: string }, FleetError> {
  return Effect.gen(function* () {
    const auth = yield* requireSession(request, env);
    const licenseRow = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(`SELECT id, tier FROM licenses WHERE customer_id = ? AND status = 'active'`)
          .bind(auth.user.id)
          .first(),
      catch: cause => new FleetStoreUnavailable(cause),
    });
    if (licenseRow === null) {
      return yield* Effect.fail(new FleetForbiddenError('No active license found'));
    }
    const license = yield* Schema.decodeUnknown(FleetLicenseRowSchema)(licenseRow).pipe(
      Effect.mapError(cause => new FleetStoreUnavailable(cause))
    );
    if (license.tier !== 'team' && license.tier !== 'enterprise') {
      yield* Effect.fail(new FleetForbiddenError('Fleet features require Team tier'));
    }
    const body = yield* decodeJsonBody(request, FleetPushRequestSchema);
    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          `INSERT INTO audit_log (id, license_id, action, resource_type, metadata, created_at, user_email)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            license.id,
            'fleet.push',
            'config',
            JSON.stringify({
              team: body.team,
              message: body.message,
              machine_count: body.machine_count,
              size_bytes: body.lock_content.length,
            }),
            new Date().toISOString(),
            auth.user.email
          )
          .run(),
      catch: cause => new FleetStoreUnavailable(cause),
    });
    return {
      success: true as const,
      pushed_at: new Date().toISOString(),
      version: crypto.randomUUID().slice(0, 8),
    };
  });
}

function httpStatusFor(error: FleetError): number {
  switch (error._tag) {
    case 'SessionUnauthorizedError':
      return 401;
    case 'InvalidJsonBodyError':
      return 400;
    case 'FleetForbiddenError':
      return 403;
    case 'FleetStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

/**
 * HTTP adapter for fleet lock push.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON success payload or a mapped error response.
 */
export async function handleFleetPush(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(pushFleetLock(request, env));
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return errorResponse(error.message, httpStatusFor(error));
      }
      return errorResponse('Failed to process fleet push', 500);
    },
  });
}
