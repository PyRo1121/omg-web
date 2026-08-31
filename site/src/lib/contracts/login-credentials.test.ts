import { describe, expect, it } from 'vitest';
import {
  MAX_LOGIN_EMAIL_CHARACTERS,
  MAX_LOGIN_PASSWORD_CHARACTERS,
  validateLoginCredentials,
} from '../../../../shared/login-credentials';

describe('login credential boundary', () => {
  it('accepts an email with a password', () => {
    expect(validateLoginCredentials({ email: 'user@example.com', password: 'secret' })).toBeNull();
  });

  it('rejects malformed, empty, and oversized values before authentication', () => {
    expect(validateLoginCredentials({ email: 'not-an-email', password: 'secret' })).toBe(
      'Enter a valid email address.'
    );
    expect(validateLoginCredentials({ email: 'user@example.com', password: '' })).toBe(
      'Enter your password.'
    );
    expect(
      validateLoginCredentials({
        email: `${'a'.repeat(MAX_LOGIN_EMAIL_CHARACTERS)}@example.com`,
        password: 'secret',
      })
    ).toBe('Email addresses cannot exceed 254 characters.');
    expect(
      validateLoginCredentials({
        email: 'user@example.com',
        password: 'x'.repeat(MAX_LOGIN_PASSWORD_CHARACTERS + 1),
      })
    ).toBe('Passwords cannot exceed 1024 characters.');
  });
});
