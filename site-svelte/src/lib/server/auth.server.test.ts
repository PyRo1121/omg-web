import { describe, expect, it, vi } from 'vitest';
import { createShadowAuth, enforceAuthMutationRateLimit, getRequestSession } from './auth.server';

type AuthEnvironment = Parameters<typeof createShadowAuth>[0];

const AUTH_URL = 'https://shadow.example/api/auth/sign-in/email';
const PAGE_URL = new URL('https://shadow.example/dashboard/');

function unavailable(): never {
  throw new Error('The database stub must not be called');
}

const AUTH_ENVIRONMENT: AuthEnvironment = {
  BETTER_AUTH_SECRET: 'test-auth-secret',
  DB: {
    batch: unavailable,
    dump: unavailable,
    exec: unavailable,
    prepare: unavailable,
    withSession: unavailable,
  },
  GITHUB_CLIENT_ID: 'test-github-client',
  GITHUB_CLIENT_SECRET: 'test-github-secret',
};

function sessionRequest(platform: { readonly env: AuthEnvironment } | undefined) {
  return {
    platform,
    request: new Request(PAGE_URL, { headers: { cookie: 'better-auth.session=test-session' } }),
    url: PAGE_URL,
  };
}

function authRequest(method: string, clientIp?: string): Request {
  const headers = new Headers();
  if (clientIp !== undefined) {
    headers.set('CF-Connecting-IP', clientIp);
  }
  return new Request(AUTH_URL, { headers, method });
}

describe('getRequestSession', () => {
  it('fails closed before lookup when the platform is unavailable', async () => {
    let lookupCalled = false;

    const result = getRequestSession(sessionRequest(undefined), async () => {
      lookupCalled = true;
      return null;
    });

    await expect(result).rejects.toMatchObject({
      body: { message: 'Authentication service unavailable' },
      status: 503,
    });
    expect(lookupCalled).toBe(false);
  });

  it('returns null for an anonymous request', async () => {
    const session = await getRequestSession(
      sessionRequest({ env: AUTH_ENVIRONMENT }),
      async () => null
    );

    expect(session).toBeNull();
  });

  it('forwards request authority and returns only serialized dashboard fields', async () => {
    const request = sessionRequest({ env: AUTH_ENVIRONMENT });
    const providerSession = {
      session: {
        expiresAt: new Date('2027-01-02T03:04:05.000Z'),
        id: 'private-session-id',
        token: 'private-session-token',
      },
      user: {
        email: 'member@example.com',
        emailVerified: true,
        id: 'private-user-id',
        name: 'Member',
      },
    };

    const session = await getRequestSession(request, async input => {
      expect(input.env).toBe(AUTH_ENVIRONMENT);
      expect(input.headers).toBe(request.request.headers);
      expect(input.requestUrl).toBe(PAGE_URL);
      return providerSession;
    });

    expect(session).toEqual({
      session: { expiresAt: '2027-01-02T03:04:05.000Z' },
      user: { email: 'member@example.com', emailVerified: true },
    });
  });
});

describe('enforceAuthMutationRateLimit', () => {
  it('does not count non-mutating auth requests', async () => {
    const limit = vi.fn(async () => ({ success: false }));

    const response = await enforceAuthMutationRateLimit(authRequest('GET'), { limit });

    expect(response).toBeNull();
    expect(limit).not.toHaveBeenCalled();
  });

  it('fails closed when Cloudflare omits the client address', async () => {
    const limit = vi.fn(async () => ({ success: true }));

    const response = await enforceAuthMutationRateLimit(authRequest('POST'), { limit });

    expect(response?.status).toBe(503);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(limit).not.toHaveBeenCalled();
  });

  it('uses the Cloudflare client address as the limiter key', async () => {
    const limit = vi.fn(async () => ({ success: true }));

    const response = await enforceAuthMutationRateLimit(authRequest('POST', '192.0.2.1'), {
      limit,
    });

    expect(response).toBeNull();
    expect(limit).toHaveBeenCalledExactlyOnceWith({ key: '192.0.2.1' });
  });

  it('returns a non-cacheable 429 when the binding denies the key', async () => {
    const limit = vi.fn(async () => ({ success: false }));

    const response = await enforceAuthMutationRateLimit(authRequest('POST', '192.0.2.2'), {
      limit,
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Retry-After')).toBe('60');
  });

  it('fails closed when the binding throws', async () => {
    const limit = vi.fn(async () => {
      throw new Error('binding unavailable');
    });

    const response = await enforceAuthMutationRateLimit(authRequest('POST', '192.0.2.3'), {
      limit,
    });

    expect(response?.status).toBe(503);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });
});
