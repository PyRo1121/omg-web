import { describe, expect, it } from 'vitest';
import {
  parseInvitationAcceptedResult,
  parseInvitationCanceledResult,
  parseInvitationCreatedResult,
  parseInvitationRejectedResult,
  OrganizationInvitationResponseInvalid,
} from './organization-invitation.server';

describe('Better Auth organization invitation result boundaries', () => {
  it('accepts only the documented lifecycle response shapes', () => {
    expect(parseInvitationCreatedResult({ status: 'pending' })).toEqual({ status: 'pending' });
    expect(parseInvitationCanceledResult({ status: 'canceled' })).toEqual({
      status: 'canceled',
    });
    expect(
      parseInvitationRejectedResult({ invitation: { status: 'rejected' }, member: null })
    ).toEqual({
      invitation: { status: 'rejected' },
      member: null,
    });
    expect(
      parseInvitationAcceptedResult({
        invitation: { status: 'accepted' },
        member: { role: 'member' },
      })
    ).toEqual({
      invitation: { status: 'accepted' },
      member: { role: 'member' },
    });
  });

  it('rejects a response that could hide an unparsed Better Auth failure', () => {
    expect(() => parseInvitationCanceledResult({ invitation: { status: 'canceled' } })).toThrow(
      OrganizationInvitationResponseInvalid
    );
    expect(() => parseInvitationAcceptedResult({ invitation: { status: 'accepted' } })).toThrow(
      OrganizationInvitationResponseInvalid
    );
  });
});
