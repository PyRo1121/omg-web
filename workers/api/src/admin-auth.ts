import { Cause, Effect, Exit, Option } from 'effect';
import {
  type Env,
  errorResponse,
  getAuthToken,
  validateSession,
  type Session,
  type User,
} from './api';
import { customerIsAdmin } from './contracts/d1-extras';

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
class SessionForbiddenError extends Error {
  readonly _tag = 'SessionForbiddenError';
  constructor(override readonly cause?: unknown) {
    super('Forbidden');
  }
}

/** D1 could not determine the persisted admin flag. */
class AdminAuthorizationUnavailable extends Error {
  readonly _tag = 'AdminAuthorizationUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Admin authorization unavailable');
  }
}

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
    // `validateSession` already returns the `{ user, session }` pair.
    Effect.flatMap(auth =>
      auth === null ? Effect.fail(new SessionUnauthorizedError('invalid')) : Effect.succeed(auth)
    )
  );
}

/** Convert the typed session gate into the common HTTP-handler result shape. */
export async function authenticateSession(
  request: Request,
  env: Env
): Promise<AuthedSession | Response> {
  const exit = await Effect.runPromiseExit(requireSession(request, env));
  return Exit.match(exit, {
    onSuccess: auth => auth,
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      return errorResponse(
        Option.isSome(failure) ? failure.value.message : 'Invalid or expired session',
        401
      );
    },
  });
}

/** Read and decode the server-owned customer admin flag. */
export function isAdminCustomer(
  db: D1Database,
  customerId: string
): Effect.Effect<boolean, AdminAuthorizationUnavailable> {
  return Effect.tryPromise({
    try: async () => {
      const row = await db
        .prepare(`SELECT admin FROM customers WHERE id = ?`)
        .bind(customerId)
        .first();
      return customerIsAdmin(row);
    },
    catch: cause => new AdminAuthorizationUnavailable(cause),
  });
}

/**
 * Require a valid Worker session and an admin customer flag.
 *
 * @param request - Incoming request that should carry `Authorization: Bearer`.
 * @param env - Worker bindings including D1.
 * @returns Void when the caller is an admin, otherwise a tagged session error.
 */
function requireAdminSession(
  request: Request,
  env: Env
): Effect.Effect<
  void,
  SessionUnauthorizedError | SessionForbiddenError | AdminAuthorizationUnavailable
> {
  return Effect.gen(function* () {
    const auth = yield* requireSession(request, env);
    if (!(yield* isAdminCustomer(env.DB, auth.user.id))) {
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
      if (Option.isSome(failure)) {
        switch (failure.value._tag) {
          case 'SessionForbiddenError':
            return errorResponse('Forbidden', 403);
          case 'AdminAuthorizationUnavailable':
            return errorResponse('Admin authorization unavailable', 503);
          case 'SessionUnauthorizedError':
            return errorResponse(failure.value.message, 401);
        }
      }
      return errorResponse('Unauthorized', 401);
    },
  });
}
