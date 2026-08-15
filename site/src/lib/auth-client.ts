import { createAuthClient } from 'better-auth/solid';

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
