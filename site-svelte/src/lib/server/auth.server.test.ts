import { describe, expect, it, vi } from 'vitest';
import { enforceAuthMutationRateLimit } from './auth.server';

const AUTH_URL = 'https://shadow.example/api/auth/sign-in/email';

function authRequest(method: string, clientIp?: string): Request {
  const headers = new Headers();
  if (clientIp !== undefined) {
    headers.set('CF-Connecting-IP', clientIp);
  }
  return new Request(AUTH_URL, { headers, method });
}

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
