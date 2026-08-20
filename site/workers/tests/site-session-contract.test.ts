import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeSiteSessionRequest,
  decodeSiteSessionWorkerResponse,
  decodeCustomerRow,
  decodeSessionRow,
} from '../src/contracts/site-session';

/** Keep in sync with `site/src/lib/contracts/site-session.test.ts`. */
const validRequest = {
  email: 'Ada@Example.COM',
  name: 'Ada',
  betterAuthUserId: 'user_1',
  role: 'admin',
};

function isSuccess<A, E>(exit: Exit.Exit<A, E>): boolean {
  return Exit.isSuccess(exit);
}

describe('decodeSiteSessionRequest', () => {
  it('normalizes and brands a valid email', async () => {
    const exit = await Effect.runPromiseExit(decodeSiteSessionRequest(validRequest));
    expect(isSuccess(exit)).toBe(true);
    if (exit._tag !== 'Success') {
      return;
    }
    expect(exit.value.email).toBe('ada@example.com');
    expect(exit.value.name).toBe('Ada');
    expect(exit.value.role).toBe('admin');
  });

  it('ignores extra fields', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSiteSessionRequest({ ...validRequest, extra: true })
    );
    expect(isSuccess(exit)).toBe(true);
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

describe('decodeCustomerRow', () => {
  it('decodes a valid customer row', async () => {
    const exit = await Effect.runPromiseExit(
      decodeCustomerRow({ id: 'cust_1', email: 'ada@example.com', admin: 1 })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a missing admin flag', async () => {
    const exit = await Effect.runPromiseExit(
      decodeCustomerRow({ id: 'cust_1', email: 'ada@example.com' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeSessionRow', () => {
  it('decodes a valid session row', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSessionRow({ token: 'tok_abc', expires_at: '2026-01-01T00:00:00.000Z' })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects an empty token', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSessionRow({ token: '', expires_at: '2026-01-01T00:00:00.000Z' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeSiteSessionWorkerResponse', () => {
  it('decodes a valid Worker session payload', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSiteSessionWorkerResponse({
        token: 'tok_abc',
        expiresAt: '2026-01-01T00:00:00.000Z',
        customerId: 'cust_1',
      })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a non-string token', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSiteSessionWorkerResponse({
        token: 123,
        expiresAt: '2026-01-01T00:00:00.000Z',
        customerId: 'cust_1',
      })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
