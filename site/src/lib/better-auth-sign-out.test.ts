import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { revokeBetterAuthSession } from './better-auth-sign-out';

describe('revokeBetterAuthSession', () => {
  it('reports no failures after Better Auth revocation succeeds', async () => {
    const result = await Effect.runPromise(revokeBetterAuthSession(async () => undefined));

    expect(result.failures).toEqual([]);
  });

  it('returns a classified failure instead of rejecting', async () => {
    const cause = new Error('offline');
    const result = await Effect.runPromise(
      revokeBetterAuthSession(async () => Promise.reject(cause))
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?._tag).toBe('BetterAuthSignOutError');
    expect(result.failures[0]?.cause).toBe(cause);
  });
});
