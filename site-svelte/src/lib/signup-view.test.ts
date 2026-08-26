import { describe, expect, it } from 'vitest';
import { validateSignupRequest } from './signup-view.svelte';

describe('validateSignupRequest', () => {
  it('accepts the github provider', () => {
    expect(validateSignupRequest({ provider: 'github' })).toBeNull();
  });

  it('rejects other providers', () => {
    expect(validateSignupRequest({ provider: 'google' })).toBe(
      'Public sign-up is limited to verified GitHub identities.'
    );
  });

  it('rejects an empty provider', () => {
    expect(validateSignupRequest({ provider: '' })).toBe(
      'Public sign-up is limited to verified GitHub identities.'
    );
  });
});
