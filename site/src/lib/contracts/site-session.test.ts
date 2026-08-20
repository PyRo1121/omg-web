import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { decodeSiteSessionRequest, decodeSiteSessionWorkerResponse } from './site-session';

/** Keep in sync with `site/workers/tests/site-session-contract.test.ts`. */
const validWorkerResponse = {
  token: 'tok_abc',
  expiresAt: '2026-01-01T00:00:00.000Z',
  customerId: 'cust_1',
};

/** Keep in sync with `site/workers/tests/site-session-contract.test.ts`. */
const validRequest = {
  email: 'Ada@Example.COM',
  name: 'Ada',
  betterAuthUserId: 'user_1',
  role: 'admin',
};

function isSuccess<A, E>(exit: Exit.Exit<A, E>): exit is Exit.Success<A, E> {
  return exit._tag === 'Success';
}

describe('decodeSiteSessionRequest', () => {
  it('normalizes a valid identity and preserves its role', async () => {
    const exit = await Effect.runPromiseExit(decodeSiteSessionRequest(validRequest));
    expect(isSuccess(exit)).toBe(true);
    if (!isSuccess(exit)) {
      return;
    }
    expect(exit.value.email).toBe('ada@example.com');
    expect(exit.value.name).toBe('Ada');
    expect(exit.value.role).toBe('admin');
  });

  it('rejects an unknown role', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSiteSessionRequest({ ...validRequest, role: 'owner' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSiteSessionRequest({ ...validRequest, email: 'not-an-email' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeSiteSessionWorkerResponse', () => {
  it('decodes a valid server-only Worker session payload', async () => {
    const exit = await Effect.runPromiseExit(decodeSiteSessionWorkerResponse(validWorkerResponse));
    expect(isSuccess(exit)).toBe(true);
    if (!isSuccess(exit)) {
      return;
    }
    expect(exit.value.token).toBe('tok_abc');
    expect(exit.value.customerId).toBe('cust_1');
  });

  it('rejects a missing token', async () => {
    const { token: _token, ...missingToken } = validWorkerResponse;
    const exit = await Effect.runPromiseExit(decodeSiteSessionWorkerResponse(missingToken));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects a non-string token', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSiteSessionWorkerResponse({ ...validWorkerResponse, token: 123 })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
