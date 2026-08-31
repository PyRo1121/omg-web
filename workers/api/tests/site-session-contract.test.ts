import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { decodeSiteSessionWorkerResponse, decodeCustomerRow } from '../../../shared/site-session';

function isSuccess<A, E>(exit: Exit.Exit<A, E>): boolean {
  return Exit.isSuccess(exit);
}

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
