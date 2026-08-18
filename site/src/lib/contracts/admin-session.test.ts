import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeAdminSessionClientResponse,
  decodeAdminSessionRequest,
  decodeAdminSessionWorkerResponse,
} from './admin-session';

/** Keep in sync with `site/workers/tests/admin-session-contract.test.ts`. */
const validWorkerResponse = {
  token: 'tok_abc',
  expiresAt: '2026-01-01T00:00:00.000Z',
  customerId: 'cust_1',
};

/** Keep in sync with `site/workers/tests/admin-session-contract.test.ts`. */
const validClientResponse = {
  token: 'tok_abc',
  expiresAt: '2026-01-01T00:00:00.000Z',
};

/** Keep in sync with `site/workers/tests/admin-session-contract.test.ts`. */
const validRequest = {
  email: 'Ada@Example.COM',
  name: 'Ada',
  betterAuthUserId: 'user_1',
};

function isSuccess<A, E>(exit: Exit.Exit<A, E>): exit is Exit.Success<A, E> {
  return exit._tag === 'Success';
}

describe('decodeAdminSessionRequest', () => {
  it('normalizes and brands a valid email', async () => {
    const exit = await Effect.runPromiseExit(decodeAdminSessionRequest(validRequest));
    expect(isSuccess(exit)).toBe(true);
    if (!isSuccess(exit)) {
      return;
    }
    expect(exit.value.email).toBe('ada@example.com');
    expect(exit.value.name).toBe('Ada');
  });

  it('ignores extra fields', async () => {
    const exit = await Effect.runPromiseExit(
      decodeAdminSessionRequest({ ...validRequest, extra: true })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const exit = await Effect.runPromiseExit(
      decodeAdminSessionRequest({ ...validRequest, email: 'not-an-email' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeAdminSessionWorkerResponse', () => {
  it('decodes a valid Worker session payload', async () => {
    const exit = await Effect.runPromiseExit(decodeAdminSessionWorkerResponse(validWorkerResponse));
    expect(isSuccess(exit)).toBe(true);
    if (!isSuccess(exit)) {
      return;
    }
    expect(exit.value.token).toBe('tok_abc');
    expect(exit.value.customerId).toBe('cust_1');
  });

  it('ignores extra fields', async () => {
    const exit = await Effect.runPromiseExit(
      decodeAdminSessionWorkerResponse({ ...validWorkerResponse, nonce: 1 })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a missing token', async () => {
    const { token: _token, ...missingToken } = validWorkerResponse;
    const exit = await Effect.runPromiseExit(decodeAdminSessionWorkerResponse(missingToken));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects a non-string token (forward-incompatible shape)', async () => {
    const exit = await Effect.runPromiseExit(
      decodeAdminSessionWorkerResponse({ ...validWorkerResponse, token: 123 })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeAdminSessionClientResponse', () => {
  it('decodes a valid auth-bridge payload', async () => {
    const exit = await Effect.runPromiseExit(decodeAdminSessionClientResponse(validClientResponse));
    expect(isSuccess(exit)).toBe(true);
    if (!isSuccess(exit)) {
      return;
    }
    expect(exit.value.expiresAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects an empty token', async () => {
    const exit = await Effect.runPromiseExit(
      decodeAdminSessionClientResponse({ ...validClientResponse, token: '' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
