import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import {
  toValidateLicenseRequest,
  ValidateLicenseFieldsSchema,
  ValidateLicenseRowSchema,
  decodeRow,
} from '../src/contracts/validate-license';

describe('toValidateLicenseRequest', () => {
  it('prefers key over license_key', async () => {
    const fields = Schema.decodeUnknownSync(ValidateLicenseFieldsSchema)({
      key: 'from-key',
      license_key: 'from-license-key',
    });
    const request = toValidateLicenseRequest(fields);
    expect(request?.licenseKey).toBe('from-key');
  });

  it('returns null when both keys are empty', async () => {
    const fields = Schema.decodeUnknownSync(ValidateLicenseFieldsSchema)({
      key: '',
      license_key: '',
    });
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
