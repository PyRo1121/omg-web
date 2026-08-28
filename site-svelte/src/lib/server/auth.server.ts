import { error, redirect } from '@sveltejs/kit';
import { betterAuth } from 'better-auth';
import { createAccessControl } from 'better-auth/plugins/access';
import { organization } from 'better-auth/plugins/organization';
import type { WebsiteEnv } from '../../../alchemy.run';
import { loadOrganizationMembershipLimit } from './organization-workspace.server';

export type AuthEnvironment = Pick<
  WebsiteEnv,
  'BETTER_AUTH_SECRET' | 'DB' | 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET'
>;

interface AuthRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface AuthSessionRequest {
  readonly platform: { readonly env: AuthEnvironment } | undefined;
  readonly request: { readonly headers: Headers };
  readonly url: URL;
}

interface AuthProviderSession {
  readonly session: {
    readonly expiresAt: Date;
  };
  readonly user: {
    readonly email: string;
    readonly emailVerified: boolean;
  };
}

interface AuthSessionLookupInput {
  readonly env: AuthEnvironment;
  readonly headers: Headers;
  readonly requestUrl: URL;
}

interface RequestSession {
  readonly session: {
    readonly expiresAt: string;
  };
  readonly user: {
    readonly email: string;
    readonly emailVerified: boolean;
  };
}

type AuthSessionLookup = (input: AuthSessionLookupInput) => Promise<AuthProviderSession | null>;

const RATE_LIMIT_FAILURE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const RATE_LIMITED_HEADERS = { ...RATE_LIMIT_FAILURE_HEADERS, 'Retry-After': '60' } as const;
const organizationAccess = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
});
const bootstrapOnlyOrganizationRole = organizationAccess.newRole({
  organization: [],
  member: [],
  invitation: [],
});

async function lookupAuthSession({
  env,
  headers,
  requestUrl,
}: AuthSessionLookupInput): Promise<AuthProviderSession | null> {
  const auth = createShadowAuth(env, requestUrl);
  return auth.api.getSession({ headers });
}

/**
 * Reads and serializes the current request's session without retaining per-user server state.
 *
 * @param event - Request-local platform, URL, and authentication headers.
 * @param lookup - Session provider seam; defaults to Better Auth.
 * @returns The minimal authenticated session fields used by routes, or `null` for an anonymous request.
 */
export async function getRequestSession(
  event: AuthSessionRequest,
  lookup: AuthSessionLookup = lookupAuthSession
): Promise<RequestSession | null> {
  const platform = event.platform;
  if (platform === undefined) {
    error(503, 'Authentication service unavailable');
  }

  const session = await lookup({
    env: platform.env,
    headers: event.request.headers,
    requestUrl: event.url,
  });
  if (session === null) {
    return null;
  }

  return {
    session: {
      expiresAt: session.session.expiresAt.toISOString(),
    },
    user: {
      email: session.user.email,
      emailVerified: session.user.emailVerified,
    },
  };
}

export async function loadAuthEntry(event: AuthSessionRequest): Promise<Record<string, never>> {
  const session = await getRequestSession(event);
  if (session !== null) {
    redirect(302, '/dashboard/');
  }

  return {};
}

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
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectURI: `${requestUrl.origin}/api/auth/callback/github`,
      },
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
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        organizationLimit: 1,
        creatorRole: 'owner',
        membershipLimit: (_user, currentOrganization) =>
          loadOrganizationMembershipLimit(env.DB, currentOrganization.id),
        ac: organizationAccess,
        roles: {
          owner: bootstrapOnlyOrganizationRole,
          admin: bootstrapOnlyOrganizationRole,
          member: bootstrapOnlyOrganizationRole,
        },
        invitationExpiresIn: 60 * 60 * 48,
        invitationLimit: 0,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        disableOrganizationDeletion: true,
        teams: { enabled: false },
        schema: {
          session: {
            fields: {
              activeOrganizationId: 'active_organization_id',
            },
          },
          organization: {
            modelName: 'auth_organization',
            fields: {
              createdAt: 'created_at',
            },
            additionalFields: {
              billingCustomerId: {
                type: 'string',
                required: true,
                input: false,
                returned: false,
                fieldName: 'billing_customer_id',
              },
            },
          },
          member: {
            modelName: 'auth_member',
            fields: {
              organizationId: 'organization_id',
              userId: 'user_id',
              createdAt: 'created_at',
            },
          },
          invitation: {
            modelName: 'auth_invitation',
            fields: {
              organizationId: 'organization_id',
              expiresAt: 'expires_at',
              createdAt: 'created_at',
              inviterId: 'inviter_id',
            },
          },
        },
      }),
    ],
  });
}

export type ShadowAuth = ReturnType<typeof createShadowAuth>;
