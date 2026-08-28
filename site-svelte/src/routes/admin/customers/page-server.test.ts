import { describe, expect, it } from 'vitest';
import {
  inspectAdminCustomer,
  requireAdminCustomerIdentity,
  updateAdminCustomerLicenseAction,
} from '../../../lib/server/admin-customer-route-actions.server';

function event(body: string) {
  return {
    platform: undefined,
    request: new Request('https://shadow.example/admin/customers/?/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
    url: new URL('https://shadow.example/admin/customers/'),
  };
}

describe('admin customer route actions', () => {
  it('fails closed when the platform is unavailable', async () => {
    await expect(requireAdminCustomerIdentity(event(''))).rejects.toMatchObject({ status: 503 });
  });

  it('rejects an oversized inspect body before authentication', async () => {
    const result = await inspectAdminCustomer(event(`email=${'x'.repeat(9000)}`));

    expect('status' in result).toBe(true);
    if (!('status' in result)) throw new Error('Expected an action failure');
    expect(result.status).toBe(413);
    expect(result.data).toEqual({ kind: 'error', message: 'Select a valid customer.' });
  });

  it('rejects an unconfirmed update before authentication', async () => {
    const result = await updateAdminCustomerLicenseAction(
      event('email=customer%40example.com&tier=team&status=active')
    );

    expect('status' in result).toBe(true);
    if (!('status' in result)) throw new Error('Expected an action failure');
    expect(result.status).toBe(400);
    expect(result.data).toEqual({
      kind: 'error',
      message: 'Choose valid license values and confirm the change.',
    });
  });
});
