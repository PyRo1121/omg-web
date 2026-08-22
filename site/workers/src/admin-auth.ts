import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import {
  type Env,
  errorResponse,
  getAuthToken,
  validateSession,
  type Session,
  type User,
} from './api';

/** The request has no valid Bearer session. */
export class SessionUnauthorizedError extends Error {
  readonly _tag = 'SessionUnauthorizedError';
  constructor(
    readonly reason: 'missing' | 'invalid' = 'missing',
    override readonly cause?: unknown
  ) {
    super(reason === 'invalid' ? 'Invalid or expired session' : 'Authorization required');
  }
}

/** The session belongs to a non-admin customer. */
export class SessionForbiddenError extends Error {
  readonly _tag = 'SessionForbiddenError';
  constructor(override readonly cause?: unknown) {
    super('Forbidden');
  }
}

const AdminFlagRowSchema = Schema.Struct({
  admin: Schema.Number,
});

/** A validated Worker session and customer. */
export interface AuthedSession {
  readonly user: User;
  readonly session: Session;
}

/**
 * Require a valid Worker Bearer session.
 *
 * @param request - Incoming request that should carry `Authorization: Bearer`.
 * @param env - Worker bindings including D1.
 * @returns The session pair, or `SessionUnauthorizedError`.
 */
export function requireSession(
  request: Request,
  env: Env
): Effect.Effect<AuthedSession, SessionUnauthorizedError> {
  const token = getAuthToken(request);
  if (token === null || token.length === 0) {
    return Effect.fail(new SessionUnauthorizedError('missing'));
  }
  return Effect.tryPromise({
    try: () => validateSession(env.DB, token),
    catch: cause => new SessionUnauthorizedError('invalid', cause),
  }).pipe(
    Effect.flatMap(auth =>
      auth === null
        ? Effect.fail(new SessionUnauthorizedError('invalid'))
        : Effect.succeed({ user: auth.user, session: auth.session })
    )
  );
}

/**
 * Require a valid Worker session and an admin customer flag.
 *
 * @param request - Incoming request that should carry `Authorization: Bearer`.
 * @param env - Worker bindings including D1.
 * @returns Void when the caller is an admin, otherwise a tagged session error.
 */
export function requireAdminSession(
  request: Request,
  env: Env
): Effect.Effect<void, SessionUnauthorizedError | SessionForbiddenError> {
  return Effect.gen(function* () {
    const auth = yield* requireSession(request, env);
    const row = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(`SELECT admin FROM customers WHERE id = ?`).bind(auth.user.id).first(),
      catch: cause => new SessionUnauthorizedError('invalid', cause),
    });
    if (row === null) {
      return yield* Effect.fail(new SessionUnauthorizedError('invalid'));
    }
    const decoded = yield* Schema.decodeUnknown(AdminFlagRowSchema)(row).pipe(
      Effect.mapError(cause => new SessionForbiddenError(cause))
    );
    if (decoded.admin !== 1) {
      yield* Effect.fail(new SessionForbiddenError());
    }
  });
}

/**
 * Return 401/403 when the caller is not an admin session.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns A denial response, or `null` when the session is an admin.
 */
export async function forbiddenUnlessAdminSession(
  request: Request,
  env: Env
): Promise<Response | null> {
  const exit = await Effect.runPromiseExit(requireAdminSession(request, env));
  return Exit.match(exit, {
    onSuccess: () => null,
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure) && failure.value._tag === 'SessionForbiddenError') {
        return errorResponse('Forbidden', 403);
      }
      return errorResponse('Unauthorized', 401);
    },
  });
}
