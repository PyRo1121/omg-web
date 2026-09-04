import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  readAdminBillingPortalRequest,
  readAdminCustomerLicenseUpdate,
  readAdminCustomerNoteCreate,
  readAdminCustomerNoteDelete,
  readAdminCustomerSelection,
  readAdminCustomerTagAssignment,
  readAdminCustomerTagCreate,
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

  it('decodes note and tag mutations without accepting database identifiers', async () => {
    const note = await Effect.runPromise(
      readAdminCustomerNoteCreate(
        request('email=customer%40example.com&content=Follow-up+scheduled.&noteType=success')
      )
    );
    const tag = await Effect.runPromise(
      readAdminCustomerTagAssignment(
        request('email=customer%40example.com&tagName=Expansion&intent=assign')
      )
    );
    const catalogTag = await Effect.runPromise(
      readAdminCustomerTagCreate(
        request(
          'email=customer%40example.com&name=Needs+review&color=%23ff00aa&description=Manual+follow-up'
        )
      )
    );

    expect(note).toEqual({
      email: 'customer@example.com',
      content: 'Follow-up scheduled.',
      noteType: 'success',
    });
    expect(tag).toEqual({
      email: 'customer@example.com',
      tagName: 'Expansion',
      intent: 'assign',
    });
    expect(catalogTag).toEqual({
      email: 'customer@example.com',
      name: 'Needs review',
      color: '#ff00aa',
      description: 'Manual follow-up',
    });
  });

  it('requires exact confirmation for destructive and delegated actions', async () => {
    const noteDelete = await Effect.runPromise(
      readAdminCustomerNoteDelete(
        request(
          'email=customer%40example.com&content=Follow-up+scheduled.&createdAt=2026-08-27T12%3A00%3A00.000Z&confirmation=delete-note'
        )
      )
    );
    const billing = await Effect.runPromise(
      readAdminBillingPortalRequest(
        request('email=customer%40example.com&confirmation=open-billing')
      )
    );

    expect(noteDelete).toEqual({
      email: 'customer@example.com',
      content: 'Follow-up scheduled.',
      createdAt: '2026-08-27T12:00:00.000Z',
    });
    expect(billing).toBe('customer@example.com');
  });

  it('rejects oversized and unconfirmed mutations before service work', async () => {
    const oversized = await Effect.runPromiseExit(
      readAdminCustomerLicenseUpdate(request(`email=${'x'.repeat(9000)}`))
    );
    const unconfirmedLicense = await Effect.runPromiseExit(
      readAdminCustomerLicenseUpdate(
        request('email=customer%40example.com&tier=team&status=active')
      )
    );
    const unconfirmedDelete = await Effect.runPromiseExit(
      readAdminCustomerNoteDelete(
        request(
          'email=customer%40example.com&content=Follow-up&createdAt=2026-08-27T12%3A00%3A00.000Z'
        )
      )
    );

    expect(Exit.isFailure(oversized)).toBe(true);
    expect(Exit.isFailure(unconfirmedLicense)).toBe(true);
    expect(Exit.isFailure(unconfirmedDelete)).toBe(true);
  });
});
