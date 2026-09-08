import { signIn } from './auth-client';

/**
 * Start one GitHub OAuth redirect. Returns the failure message to display, or
 * an empty string when the browser is navigating away.
 */
export type GitHubSocialSignIn = typeof signIn.social;

export async function githubSignInError(
  destination: () => string,
  failureLabel: string,
  socialSignIn: GitHubSocialSignIn = signIn.social
): Promise<string> {
  try {
    const result = await socialSignIn({
      provider: 'github',
      callbackURL: destination(),
    });
    return result?.error ? (result.error.message ?? failureLabel) : '';
  } catch {
    return failureLabel;
  }
}
