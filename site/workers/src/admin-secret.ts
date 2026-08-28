import { Effect } from 'effect';

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
  return requireInternalSecret(provided, [expected]);
}

/** Accept one caller-specific internal secret without weakening missing-secret failure. */
export function requireInternalSecret(
  provided: string | null,
  expectedSecrets: ReadonlyArray<string | undefined>
): Effect.Effect<void, AdminUnauthorizedError> {
  if (provided === null) {
    return Effect.fail(new AdminUnauthorizedError());
  }
  const matches = expectedSecrets.some(
    expected =>
      expected !== undefined && expected.length > 0 && timingSafeEqualUtf8(provided, expected)
  );
  return matches ? Effect.void : Effect.fail(new AdminUnauthorizedError());
}
