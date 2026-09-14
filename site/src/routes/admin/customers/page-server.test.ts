import { describe, expect, it } from 'vitest';
import {
  createAdminCustomerNoteAction,
  deleteAdminCustomerNoteAction,
  inspectAdminCustomer,
  openAdminCustomerBillingPortalAction,
  updateAdminCustomerLicenseAction,
} from '../../../lib/server/admin-customer-route-actions.server';
import { requireAdminPageContext } from '../../../lib/server/admin-page.server';

function event(body: string) {
  return {
    platform: undefined,
    request: new Request('https://shadow.example/admin/customers/?/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
    url: new URL('https://shadow.example/admin/customers/'),
    setHeaders: () => undefined,
  };
}

describe('admin customer route actions', () => {
  it('fails closed when the platform is unavailable', async () => {
    await expect(requireAdminPageContext(event(''))).rejects.toMatchObject({ status: 503 });
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

  it('bounds CRM mutations before authentication', async () => {
    const result = await createAdminCustomerNoteAction(
      event(`email=customer%40example.com&content=${'x'.repeat(9000)}&noteType=general`)
    );

    expect('status' in result).toBe(true);
    if (!('status' in result)) throw new Error('Expected an action failure');
    expect(result.status).toBe(413);
    expect(result.data).toEqual({ kind: 'error', message: 'Enter a valid support note.' });
  });

  it('requires exact confirmation before note deletion or delegated billing', async () => {
    const deleteResult = await deleteAdminCustomerNoteAction(
      event('email=customer%40example.com&content=Follow-up&createdAt=2026-08-27T12%3A00%3A00.000Z')
    );
    const billingResult = await openAdminCustomerBillingPortalAction(
      event('email=customer%40example.com')
    );

    for (const result of [deleteResult, billingResult]) {
      expect('status' in result).toBe(true);
      if (!('status' in result)) throw new Error('Expected an action failure');
      expect(result.status).toBe(400);
    }
  });
});
