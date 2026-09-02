import { signIn } from './auth-client';

/**
 * Start one GitHub OAuth redirect. Returns the failure message to display, or
 * an empty string when the browser is navigating away.
 */
export async function githubSignInError(
  destination: () => string,
  failureLabel: string
): Promise<string> {
  try {
    const result = await signIn.social({
      provider: 'github',
      callbackURL: destination(),
    });
    return result?.error ? (result.error.message ?? failureLabel) : '';
  } catch {
    return failureLabel;
  }
}
