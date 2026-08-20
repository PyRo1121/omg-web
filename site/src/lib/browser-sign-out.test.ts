import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { signOutEverywhere } from './browser-sign-out';

function successfulTermination(): Promise<void> {
  return Promise.resolve();
}

describe('signOutEverywhere', () => {
  it('reports complete sign-out when both authorities succeed', async () => {
    const result = await Effect.runPromise(
      signOutEverywhere(successfulTermination, successfulTermination)
    );
    expect(result.failures).toEqual([]);
  });

  it('attempts Better Auth when Worker revocation fails', async () => {
    let betterAuthAttempted = false;
    const result = await Effect.runPromise(
      signOutEverywhere(
        () => Promise.reject(new Error('Worker unavailable')),
        () => {
          betterAuthAttempted = true;
          return Promise.resolve();
        }
      )
    );

    expect(betterAuthAttempted).toBe(true);
    expect(result.failures.map(failure => failure._tag)).toEqual(['WorkerSessionSignOutError']);
  });

  it('reports a Better Auth failure after Worker revocation succeeds', async () => {
    const result = await Effect.runPromise(
      signOutEverywhere(successfulTermination, () =>
        Promise.reject(new Error('Cookie revocation failed'))
      )
    );
    expect(result.failures.map(failure => failure._tag)).toEqual(['BetterAuthSignOutError']);
  });
});
