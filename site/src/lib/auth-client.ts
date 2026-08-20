import { createAuthClient } from 'better-auth/solid';
import { Effect } from 'effect';
import { logout } from './api';
import { signOutEverywhere, type BrowserSignOutResult } from './browser-sign-out';

const getBaseURL = () => {
  if (import.meta.env.SSR) {
    return import.meta.env.VITE_BETTER_AUTH_URL || 'https://pyro1121.com';
  }
  return window.location.origin;
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * Revoke both browser session authorities without allowing one failure to skip the other.
 *
 * @returns Classified partial failures after Worker and Better Auth sign-out are attempted.
 */
export function signOutBrowserSessions(): Promise<BrowserSignOutResult> {
  return Effect.runPromise(
    signOutEverywhere(logout, async () => {
      await signOut();
    })
  );
}
