import { describe, expect, it } from 'vitest';
import {
  parseRemovedMemberResult,
  parseUpdatedMemberResult,
  OrganizationMemberResponseInvalid,
} from './organization-member.server';

describe('Better Auth organization member result boundaries', () => {
  it('accepts the minimal role and removal projections', () => {
    expect(parseUpdatedMemberResult({ role: 'admin' })).toEqual({ role: 'admin' });
    expect(parseRemovedMemberResult({ member: { role: 'member' } })).toEqual({
      member: { role: 'member' },
    });
  });

  it('rejects responses that could leak or depend on unparsed member records', () => {
    expect(() => parseUpdatedMemberResult({ id: 'private-member-id' })).toThrow(
      OrganizationMemberResponseInvalid
    );
    expect(() => parseRemovedMemberResult({ member: null })).toThrow(
      OrganizationMemberResponseInvalid
    );
  });
});
