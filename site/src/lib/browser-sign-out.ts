import { Effect, Either } from 'effect';

/** Worker session revocation failed during browser sign-out. */
export class WorkerSessionSignOutError extends Error {
  readonly _tag = 'WorkerSessionSignOutError';

  constructor(readonly cause: unknown) {
    super('Worker session revocation failed');
  }
}

/** Better Auth cookie revocation failed during browser sign-out. */
export class BetterAuthSignOutError extends Error {
  readonly _tag = 'BetterAuthSignOutError';

  constructor(readonly cause: unknown) {
    super('Better Auth sign-out failed');
  }
}

/** A classified partial failure from cross-authority browser sign-out. */
export type BrowserSignOutError = WorkerSessionSignOutError | BetterAuthSignOutError;

/** Observable result after both browser session authorities have been attempted. */
export interface BrowserSignOutResult {
  readonly failures: ReadonlyArray<BrowserSignOutError>;
}

/**
 * Attempt Worker and Better Auth sign-out without allowing one failure to skip the other.
 *
 * @param revokeWorkerSession - Revokes and locally clears the Worker credential.
 * @param revokeBetterAuthSession - Revokes the Better Auth cookie session.
 * @returns Classified partial failures after both authorities have been attempted.
 */
export function signOutEverywhere(
  revokeWorkerSession: () => Promise<void>,
  revokeBetterAuthSession: () => Promise<void>
): Effect.Effect<BrowserSignOutResult> {
  return Effect.gen(function* () {
    const workerResult = yield* Effect.either(
      Effect.tryPromise({
        try: revokeWorkerSession,
        catch: cause => new WorkerSessionSignOutError(cause),
      })
    );
    const betterAuthResult = yield* Effect.either(
      Effect.tryPromise({
        try: revokeBetterAuthSession,
        catch: cause => new BetterAuthSignOutError(cause),
      })
    );

    const failures: BrowserSignOutError[] = [];
    if (Either.isLeft(workerResult)) {
      failures.push(workerResult.left);
    }
    if (Either.isLeft(betterAuthResult)) {
      failures.push(betterAuthResult.left);
    }
    return { failures };
  });
}
