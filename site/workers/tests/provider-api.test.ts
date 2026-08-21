import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { verifyTurnstile, type ProviderFetch } from '../src/api';

function responseFetch(body: string, status = 200): ProviderFetch {
  return () => Promise.resolve(new Response(body, { status }));
}

describe('provider API boundaries', () => {
  it('returns a decoded Turnstile rejection reason', async () => {
    const decision = await Effect.runPromise(
      verifyTurnstile(
        'token',
        'secret',
        null,
        responseFetch(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }))
      )
    );

    expect(decision).toEqual({
      success: false,
      error: 'invalid-input-response',
    });
  });

  it('fails with a typed provider error for malformed Turnstile JSON', async () => {
    const exit = await Effect.runPromiseExit(
      verifyTurnstile('token', 'secret', null, responseFetch('{'))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause._tag).toBe('Fail');
    }
  });

  it('fails closed when Turnstile returns an invalid decision shape', async () => {
    const exit = await Effect.runPromiseExit(
      verifyTurnstile('token', 'secret', null, responseFetch(JSON.stringify({ success: 'yes' })))
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
