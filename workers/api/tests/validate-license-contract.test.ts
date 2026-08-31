import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeValidateLicenseFields,
  toValidateLicenseRequest,
  ValidateLicenseRowSchema,
  decodeRow,
} from '../src/contracts/validate-license';

describe('decodeValidateLicenseFields', () => {
  it('accepts key or license_key', async () => {
    const fromKey = await Effect.runPromise(decodeValidateLicenseFields({ key: 'abc' }));
    const fromLicenseKey = await Effect.runPromise(
      decodeValidateLicenseFields({ license_key: 'abc' })
    );
    expect(fromKey.key).toBe('abc');
    expect(fromLicenseKey.license_key).toBe('abc');
  });

  it('rejects a numeric key', async () => {
    const exit = await Effect.runPromiseExit(decodeValidateLicenseFields({ key: 123 }));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('toValidateLicenseRequest', () => {
  it('prefers key over license_key', async () => {
    const fields = await Effect.runPromise(
      decodeValidateLicenseFields({ key: 'from-key', license_key: 'from-license-key' })
    );
    const request = toValidateLicenseRequest(fields);
    expect(request?.licenseKey).toBe('from-key');
  });

  it('returns null when both keys are empty', async () => {
    const fields = await Effect.runPromise(
      decodeValidateLicenseFields({ key: '', license_key: '' })
    );
    expect(toValidateLicenseRequest(fields)).toBeNull();
  });
});

describe('ValidateLicenseRowSchema', () => {
  it('decodes an explicit license join row', async () => {
    const decoded = await Effect.runPromise(
      decodeRow(ValidateLicenseRowSchema, 'license', {
        id: 'lic_1',
        customer_id: 'cust_1',
        license_key: 'key_1',
        tier: 'free',
        status: 'active',
        max_seats: 1,
        max_machines: 1,
        expires_at: null,
        email: 'ada@example.com',
        customer_name: 'Ada',
      })
    );
    expect(decoded.customer_name).toBe('Ada');
  });
});
