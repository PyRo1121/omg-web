import { EMAIL_PATTERN } from './email';

export const MAX_LOGIN_EMAIL_CHARACTERS = 254;
export const MAX_LOGIN_PASSWORD_CHARACTERS = 1024;

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/** Validate bounded browser credentials before invoking the authoritative auth service. */
export function validateLoginCredentials(credentials: LoginCredentials): string | null {
  if (credentials.email.length > MAX_LOGIN_EMAIL_CHARACTERS) {
    return 'Email addresses cannot exceed 254 characters.';
  }
  if (!EMAIL_PATTERN.test(credentials.email)) {
    return 'Enter a valid email address.';
  }
  if (credentials.password.length === 0) {
    return 'Enter your password.';
  }
  if (credentials.password.length > MAX_LOGIN_PASSWORD_CHARACTERS) {
    return 'Passwords cannot exceed 1024 characters.';
  }
  return null;
}
