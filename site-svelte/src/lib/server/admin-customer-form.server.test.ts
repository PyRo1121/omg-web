import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  readAdminCustomerLicenseUpdate,
  readAdminCustomerSelection,
} from './admin-customer-form.server';

function request(body: string): Request {
  return new Request('https://shadow.example/admin/customers/?/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

describe('admin customer form boundary', () => {
  it('decodes and normalizes one selected customer', async () => {
    const email = await Effect.runPromise(
      readAdminCustomerSelection(request('email=customer%40example.com'))
    );

    expect(email).toBe('customer@example.com');
  });

  it('decodes a confirmed license update once', async () => {
    const update = await Effect.runPromise(
      readAdminCustomerLicenseUpdate(
        request('email=customer%40example.com&tier=team&status=active&confirmation=confirmed')
      )
    );

    expect(update).toEqual({ email: 'customer@example.com', tier: 'team', status: 'active' });
  });

  it('rejects oversized and unconfirmed mutations before service work', async () => {
    const oversized = await Effect.runPromiseExit(
      readAdminCustomerLicenseUpdate(request(`email=${'x'.repeat(9000)}`))
    );
    const unconfirmed = await Effect.runPromiseExit(
      readAdminCustomerLicenseUpdate(
        request('email=customer%40example.com&tier=team&status=active')
      )
    );

    expect(Exit.isFailure(oversized)).toBe(true);
    expect(Exit.isFailure(unconfirmed)).toBe(true);
  });
});
