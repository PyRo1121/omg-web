import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { D1Number } from '../../../shared/d1-rows';
import { DashboardLicenseRowSchema, decodeRow } from '../src/contracts/account-dashboard';

describe('decodeRow', () => {
  it('decodes an explicit license row', async () => {
    const decoded = await Effect.runPromise(
      decodeRow(DashboardLicenseRowSchema, 'license', {
        id: 'lic_1',
        license_key: 'key_1',
        tier: 'free',
        status: 'active',
        max_seats: 1,
        max_machines: 1,
        expires_at: null,
      })
    );
    expect(decoded.id).toBe('lic_1');
    expect(decoded.max_seats).toBe(1);
  });

  it('rejects a license row without a key', async () => {
    const exit = await Effect.runPromiseExit(
      decodeRow(DashboardLicenseRowSchema, 'license', {
        id: 'lic_1',
        license_key: '',
        tier: 'free',
        status: 'active',
        expires_at: null,
      })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('D1Number', () => {
  it('turns SQL NULL into 0', async () => {
    const decoded = await Effect.runPromise(decodeRow(D1Number, 'count', null));
    expect(decoded).toBe(0);
  });
});
