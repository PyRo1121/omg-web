import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { enforceRateLimit, verifyTurnstile, type ProviderFetch } from '../src/api';

function responseFetch(body: string, status = 200): ProviderFetch {
  return () => Promise.resolve(new Response(body, { status }));
}

describe('rate-limit boundary', () => {
  it('fails closed when the binding is missing', async () => {
    const response = await enforceRateLimit(undefined, 'test:missing');

    expect(response?.status).toBe(503);
  });

  it('fails closed when the binding throws', async () => {
    const limiter: RateLimit = {
      limit: async () => {
        throw new Error('limiter unavailable');
      },
    };

    const response = await enforceRateLimit(limiter, 'test:throws');
    expect(response?.status).toBe(503);
  });

  it('returns 429 for a rejected key and null for an allowed key', async () => {
    const rejected = await enforceRateLimit(
      { limit: async () => ({ success: false }) },
      'test:rejected'
    );
    const allowed = await enforceRateLimit(
      { limit: async () => ({ success: true }) },
      'test:allowed'
    );

    expect(rejected?.status).toBe(429);
    expect(allowed).toBeNull();
  });
});

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
