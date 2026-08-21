import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/auth-schema';

export interface CloudflareEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GITHUB_CLIENT_ID?: string | undefined;
  GITHUB_CLIENT_SECRET?: string | undefined;
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  ADMIN_API_SECRET?: string | undefined;
  LICENSING_API?: Fetcher | undefined;
}

interface SocialProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectURI: string;
}

interface SocialProviders {
  github?: SocialProviderConfig;
  google?: SocialProviderConfig;
}

export function createAuth(env: CloudflareEnv) {
  const db = drizzle(env.DB, { schema });
  const socialProviders: SocialProviders = {};

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      redirectURI: 'https://pyro1121.com/api/auth/callback/github',
    };
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectURI: 'https://pyro1121.com/api/auth/callback/google',
    };
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      usePlural: false,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: ['https://pyro1121.com'],
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
  });
}

export type Auth = ReturnType<typeof createAuth>;
