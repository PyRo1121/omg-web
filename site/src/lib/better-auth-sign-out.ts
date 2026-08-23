import { Effect } from 'effect';

/** Better Auth cookie revocation failed during browser sign-out. */
export class BetterAuthSignOutError extends Error {
  readonly _tag = 'BetterAuthSignOutError';
  constructor(override readonly cause: unknown) {
    super('Better Auth sign-out failed');
  }
}

/** Observable result after the browser's sole session authority is revoked. */
export interface BrowserSignOutResult {
  readonly failures: readonly BetterAuthSignOutError[];
}

/** Revoke Better Auth and return a classified error value instead of rejecting. */
export function revokeBetterAuthSession(
  revoke: () => Promise<void>
): Effect.Effect<BrowserSignOutResult> {
  return Effect.match(
    Effect.tryPromise({
      try: revoke,
      catch: cause => new BetterAuthSignOutError(cause),
    }),
    {
      onFailure: failure => ({ failures: [failure] }),
      onSuccess: () => ({ failures: [] }),
    }
  );
}
