import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeProvisionCustomerRow,
  decodeProvisionLicenseRow,
  decodeProvisionRequest,
  decodeProvisionResponse,
} from '../src/contracts/provision';

const validRequest = {
  email: 'Ada@Example.COM',
  name: 'Ada',
};

function isSuccess<A, E>(exit: Exit.Exit<A, E>): boolean {
  return Exit.isSuccess(exit);
}

describe('decodeProvisionRequest', () => {
  it('normalizes and brands a valid email', async () => {
    const exit = await Effect.runPromiseExit(decodeProvisionRequest(validRequest));
    expect(isSuccess(exit)).toBe(true);
    if (exit._tag !== 'Success') {
      return;
    }
    expect(exit.value.email).toBe('ada@example.com');
    expect(exit.value.name).toBe('Ada');
  });

  it('ignores extra fields', async () => {
    const exit = await Effect.runPromiseExit(
      decodeProvisionRequest({ ...validRequest, extra: true })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const exit = await Effect.runPromiseExit(
      decodeProvisionRequest({ ...validRequest, email: 'not-an-email' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeProvisionResponse', () => {
  it('decodes a valid provision payload', async () => {
    const exit = await Effect.runPromiseExit(
      decodeProvisionResponse({
        success: true,
        customerId: 'cust_1',
        licenseKey: 'key-abc',
      })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a missing license key', async () => {
    const exit = await Effect.runPromiseExit(
      decodeProvisionResponse({
        success: true,
        customerId: 'cust_1',
      })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeProvisionCustomerRow', () => {
  it('decodes a valid customer row', async () => {
    const exit = await Effect.runPromiseExit(
      decodeProvisionCustomerRow({ id: 'cust_1', email: 'ada@example.com' })
    );
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects a missing id', async () => {
    const exit = await Effect.runPromiseExit(
      decodeProvisionCustomerRow({ email: 'ada@example.com' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeProvisionLicenseRow', () => {
  it('decodes a valid license row', async () => {
    const exit = await Effect.runPromiseExit(decodeProvisionLicenseRow({ license_key: 'key-abc' }));
    expect(isSuccess(exit)).toBe(true);
  });

  it('rejects an empty license key', async () => {
    const exit = await Effect.runPromiseExit(decodeProvisionLicenseRow({ license_key: '' }));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
