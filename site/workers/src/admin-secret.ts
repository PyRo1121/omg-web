import { Effect, Exit } from 'effect';
import { type Env, errorResponse } from './api';
import { timingSafeEqualUtf8 } from './prelude';

/** The provided admin secret does not match the configured secret. */
export class AdminUnauthorizedError extends Error {
  readonly _tag = 'AdminUnauthorizedError';
  constructor() {
    super('Unauthorized');
  }
}

/**
 * Compare a request secret to the configured `ADMIN_API_SECRET`.
 *
 * Missing or empty configured secrets fail closed.
 *
 * @param provided - The `X-Admin-Secret` header, if present.
 * @param expected - The configured Worker secret.
 * @returns Void when the secrets match, otherwise `AdminUnauthorizedError`.
 */
export function requireAdminSecret(
  provided: string | null,
  expected: string | undefined
): Effect.Effect<void, AdminUnauthorizedError> {
  if (expected === undefined || expected.length === 0) {
    return Effect.fail(new AdminUnauthorizedError());
  }
  if (provided === null || !timingSafeEqualUtf8(provided, expected)) {
    return Effect.fail(new AdminUnauthorizedError());
  }
  return Effect.void;
}

/**
 * Return a 401 response when the request is missing a valid admin secret.
 *
 * @param request - Incoming request that should carry `X-Admin-Secret`.
 * @param env - Worker bindings that include `ADMIN_API_SECRET`.
 * @returns A 401 response, or `null` when the secret is valid.
 */
export function unauthorizedUnlessAdminSecret(
  request: Request,
  env: Pick<Env, 'ADMIN_API_SECRET'>
): Response | null {
  const exit = Effect.runSyncExit(
    requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET)
  );
  if (Exit.isFailure(exit)) {
    return errorResponse('Unauthorized', 401);
  }
  return null;
}
