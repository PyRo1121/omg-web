import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  createOrganizationInvitationReference,
  OrganizationInvitationReferenceInvalid,
  resolveOrganizationInvitationReference,
} from './organization-invitation-token.server';

const SECRET = 'organization-invitation-test-secret';
const EXPIRATION = new Date('2027-01-02T03:04:05.000Z');

function referenceFor(id = 'invitation-private-id') {
  return Effect.runPromise(createOrganizationInvitationReference(id, EXPIRATION, SECRET));
}

describe('organization invitation references', () => {
  it('round-trips a Better Auth ID without putting it in the opaque value', async () => {
    const reference = await referenceFor();

    expect(reference).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(reference).not.toContain('invitation-private-id');
    await expect(
      Effect.runPromise(
        resolveOrganizationInvitationReference(reference, SECRET, new Date('2027-01-01T00:00:00Z'))
      )
    ).resolves.toBe('invitation-private-id');
  });

  it('rejects tampering and a different secret without exposing the stored ID', async () => {
    const reference = await referenceFor();
    const parts = reference.split('.');
    const ciphertext = parts[2];
    if (parts.length !== 3 || ciphertext === undefined || ciphertext.length < 2) {
      throw new Error('reference unexpectedly malformed');
    }
    const tampered = `${parts[0]}.${parts[1]}.${ciphertext[0] === 'a' ? 'b' : 'a'}${ciphertext.slice(1)}`;

    await expect(
      Effect.runPromise(
        resolveOrganizationInvitationReference(tampered, SECRET, new Date('2027-01-01'))
      )
    ).rejects.toBeInstanceOf(OrganizationInvitationReferenceInvalid);
    await expect(
      Effect.runPromise(
        resolveOrganizationInvitationReference(
          reference,
          'different-invitation-secret',
          new Date('2027-01-01')
        )
      )
    ).rejects.toBeInstanceOf(OrganizationInvitationReferenceInvalid);
  });

  it('rejects an expired reference before it can be used', async () => {
    const reference = await referenceFor();

    await expect(
      Effect.runPromise(resolveOrganizationInvitationReference(reference, SECRET, EXPIRATION))
    ).rejects.toBeInstanceOf(OrganizationInvitationReferenceInvalid);
  });
});
