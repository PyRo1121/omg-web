import { describe, expect, it } from 'vitest';
import { parseCheckoutSessionStatus } from './dashboard-contract';

describe('parseCheckoutSessionStatus', () => {
  it('decodes a paid checkout with a provisioned license', () => {
    expect(
      parseCheckoutSessionStatus({
        status: 'paid',
        license: { license_key: 'license-key', tier: 'team' },
      })
    ).toEqual({
      ok: true,
      value: {
        status: 'paid',
        license: { license_key: 'license-key', tier: 'team' },
      },
    });
  });

  it('rejects a checkout response with an empty license key', () => {
    expect(
      parseCheckoutSessionStatus({ status: 'paid', license: { license_key: '', tier: 'team' } }).ok
    ).toBe(false);
  });
});
