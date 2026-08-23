/**
 * Convert a normalized caught Error into a user-safe message.
 *
 * @param error - A caught value already narrowed to Error.
 * @param fallback - Generic message shown for unknown or internal errors.
 * @returns A known user-facing message, or the supplied safe fallback.
 */
export function getErrorMessage(error: Error, fallback: string): string {
  switch (error.message.trim().toLowerCase()) {
    case 'invalid email or password':
      return 'Invalid email or password';
    case 'email not verified':
      return 'Email not verified';
    case 'user already exists':
    case 'user already exists. use another email.':
      return 'An account with this email already exists';
    case 'failed to fetch':
    case 'networkerror when attempting to fetch resource.':
      return 'Unable to connect. Please try again.';
    default:
      return fallback;
  }
}
