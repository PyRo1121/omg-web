import { createAuthClient } from 'better-auth/solid';
import { Effect } from 'effect';
import { revokeBetterAuthSession, type BrowserSignOutResult } from './better-auth-sign-out';

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

/** Revoke the Better Auth HttpOnly cookie without browser-stored Worker credentials. */
export function signOutBrowserSessions(): Promise<BrowserSignOutResult> {
  return Effect.runPromise(
    revokeBetterAuthSession(async () => {
      await signOut();
    })
  );
}
