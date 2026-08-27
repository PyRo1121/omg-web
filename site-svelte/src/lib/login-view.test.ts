import { describe, expect, it } from 'vitest';
import { validateCredentials } from './login-view.svelte';

describe('validateCredentials', () => {
  it('accepts an email with a password', () => {
    expect(validateCredentials({ email: 'user@example.com', password: 'secret' })).toBeNull();
  });

  it('rejects a malformed email', () => {
    expect(validateCredentials({ email: 'not-an-email', password: 'secret' })).toBe(
      'Enter a valid email address.'
    );
  });

  it('rejects credentials above the client boundary limits', () => {
    expect(
      validateCredentials({ email: `${'a'.repeat(250)}@example.com`, password: 'secret' })
    ).toBe('Email addresses cannot exceed 254 characters.');
    expect(validateCredentials({ email: 'user@example.com', password: 'x'.repeat(1025) })).toBe(
      'Passwords cannot exceed 1024 characters.'
    );
  });

  it('rejects an empty password', () => {
    expect(validateCredentials({ email: 'user@example.com', password: '' })).toBe(
      'Enter your password.'
    );
  });
});
