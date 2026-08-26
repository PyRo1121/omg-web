import { betterAuth } from 'better-auth';
import type { WebsiteEnv } from '../../../alchemy.run';

type AuthEnvironment = Pick<WebsiteEnv, 'BETTER_AUTH_SECRET' | 'DB'>;

interface AuthRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const RATE_LIMIT_FAILURE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const RATE_LIMITED_HEADERS = { ...RATE_LIMIT_FAILURE_HEADERS, 'Retry-After': '60' } as const;

export async function enforceAuthMutationRateLimit(
  request: Request,
  limiter: AuthRateLimiter
): Promise<Response | null> {
  if (request.method !== 'POST') {
    return null;
  }

  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp === null) {
    return Response.json(
      { error: 'Authentication service unavailable' },
      { headers: RATE_LIMIT_FAILURE_HEADERS, status: 503 }
    );
  }

  try {
    const result = await limiter.limit({ key: clientIp });
    return result.success
      ? null
      : Response.json(
          { error: 'Too many authentication attempts' },
          { headers: RATE_LIMITED_HEADERS, status: 429 }
        );
  } catch {
    return Response.json(
      { error: 'Authentication service unavailable' },
      { headers: RATE_LIMIT_FAILURE_HEADERS, status: 503 }
    );
  }
}

export function createShadowAuth(env: AuthEnvironment, requestUrl: URL) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: requestUrl.origin,
    trustedOrigins: [requestUrl.origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
    },
    user: {
      modelName: 'auth_user',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      modelName: 'auth_session',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
    },
    account: {
      modelName: 'auth_account',
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'auth_verification',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
  });
}

export type ShadowAuth = ReturnType<typeof createShadowAuth>;
