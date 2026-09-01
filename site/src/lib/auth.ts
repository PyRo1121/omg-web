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
}

export function createAuth(env: CloudflareEnv) {
  const db = drizzle(env.DB, { schema });
  const socialProviders: SocialProviders = {};

  const parsedBaseUrl = URL.parse(env.BETTER_AUTH_URL);
  if (parsedBaseUrl === null) {
    throw new Error('BETTER_AUTH_URL must be a valid absolute URL');
  }
  const baseUrl = parsedBaseUrl.origin;

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      redirectURI: `${baseUrl}/api/auth/callback/github`,
    };
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      usePlural: false,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: baseUrl,
    trustedOrigins: [baseUrl],
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
    },
    socialProviders,
  });
}
