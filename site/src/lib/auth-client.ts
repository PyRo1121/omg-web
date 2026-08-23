import { createAuthClient } from 'better-auth/solid';
import { Effect } from 'effect';
import { revokeBetterAuthSession, type BrowserSignOutResult } from './better-auth-sign-out';

const authClient = createAuthClient({
  baseURL: import.meta.env.SSR
    ? import.meta.env['VITE_BETTER_AUTH_URL'] || 'https://omg.latham.cloud'
    : window.location.origin,
});

const { signIn, signUp, signOut, useSession } = authClient;
export { signIn, signUp, useSession };

/** Revoke the Better Auth HttpOnly cookie without browser-stored Worker credentials. */
export function signOutBrowserSessions(): Promise<BrowserSignOutResult> {
  return Effect.runPromise(
    revokeBetterAuthSession(async () => {
      await signOut();
    })
  );
}
