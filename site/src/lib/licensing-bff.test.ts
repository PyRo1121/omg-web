import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  LicensingBodyTooLarge,
  LicensingEmailVerificationRequired,
  LicensingRouteRejected,
  LicensingSameOriginRequired,
  proxyLicensingRequest,
  type LicensingBffError,
  type LicensingIdentity,
  type LicensingService,
} from './licensing-bff';

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly cookie: string | null;
  readonly adminSecret: string | null;
  readonly body: unknown;
}

const identity: LicensingIdentity = {
  id: 'user_1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'admin',
  emailVerified: true,
};

class RecordingLicensingService implements LicensingService {
  readonly requests: RecordedRequest[] = [];

  async fetch(request: Request): Promise<Response> {
    const body: unknown = request.body === null ? null : await request.clone().json();
    this.requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get('Authorization'),
      cookie: request.headers.get('Cookie'),
      adminSecret: request.headers.get('X-Admin-Secret'),
      body,
    });
    if (new URL(request.url).pathname === '/api/internal/site-session') {
      return Response.json({
        token: 'worker_server_token',
        expiresAt: '2026-09-01T00:00:00.000Z',
        customerId: 'customer_1',
      });
    }
    return Response.json({ success: true });
  }
}

function siteRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://omg.latham.cloud${path}`, init);
}

/** Same-origin read as a browser issues it: no Origin header, Fetch Metadata set. */
function sameOriginGet(path: string): Request {
  return siteRequest(path, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
}

/** The classified BFF failure behind an exit, or null when the exit is a success. */
function failureOf(exit: Exit.Exit<Response, LicensingBffError>): LicensingBffError | null {
  if (Exit.isSuccess(exit)) {
    return null;
  }
  return Option.getOrNull(Cause.failureOption(exit.cause));
}

describe('proxyLicensingRequest', () => {
  it('keeps the Worker token server-side and forwards an allowlisted request', async () => {
    const service = new RecordingLicensingService();
    const response = await Effect.runPromise(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/admin/users?page=2', {
          headers: {
            Authorization: 'Bearer browser_attacker_token',
            Cookie: 'better-auth.session_token=secret',
            'X-Admin-Secret': 'browser_attacker_secret',
            'Sec-Fetch-Site': 'same-origin',
          },
        }),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(response.status).toBe(200);
    expect(service.requests).toHaveLength(2);
    expect(service.requests[0]).toMatchObject({
      url: 'https://omg-saas.internal/api/internal/site-session',
      method: 'POST',
      authorization: null,
      cookie: null,
      adminSecret: 'server_admin_secret',
      body: {
        email: 'ada@example.com',
        name: 'Ada',
        betterAuthUserId: 'user_1',
        role: 'admin',
      },
    });
    expect(service.requests[1]).toMatchObject({
      url: 'https://omg-saas.internal/api/admin/users?page=2',
      method: 'GET',
      authorization: 'Bearer worker_server_token',
      cookie: null,
      adminSecret: null,
    });
    expect(await response.json()).toEqual({ success: true });
  });

  it('forwards a same-origin mutation body', async () => {
    const service = new RecordingLicensingService();
    const response = await Effect.runPromise(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://omg.latham.cloud',
          },
          body: JSON.stringify({ offer: 'team' }),
        }),
        { ...identity, role: 'user' },
        'server_admin_secret',
        service
      )
    );

    expect(response.status).toBe(200);
    expect(service.requests[1]?.body).toEqual({ offer: 'team' });
  });

  it('rejects an unverified identity before minting a session', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        sameOriginGet('/api/licensing/api/account/dashboard'),
        { ...identity, emailVerified: false },
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingEmailVerificationRequired);
    expect(service.requests).toHaveLength(0);
  });

  it('rejects non-allowlisted Worker routes before minting a session', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        sameOriginGet('/api/licensing/api/internal/site-session'),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingRouteRejected);
    expect(service.requests).toHaveLength(0);
  });

  it('rejects cross-origin reads such as admin exports before minting a session', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/admin/export/users', {
          headers: { 'Sec-Fetch-Site': 'cross-site' },
        }),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingSameOriginRequired);
    expect(service.requests).toHaveLength(0);
  });

  it('rejects requests with no same-origin proof before minting a session', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/admin/dashboard'),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingSameOriginRequired);
    expect(service.requests).toHaveLength(0);
  });

  it('answers cross-origin probes with the origin failure, not the route failure', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/not-a-real-route', {
          headers: { Origin: 'https://attacker.example' },
        }),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingSameOriginRequired);
    expect(service.requests).toHaveLength(0);
  });

  it('rejects cross-origin mutations before minting a session', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/billing/checkout', {
          method: 'POST',
          headers: { Origin: 'https://attacker.example' },
        }),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingSameOriginRequired);
    expect(service.requests).toHaveLength(0);
  });

  it('rejects oversized mutation bodies before minting a session', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://omg.latham.cloud',
          },
          body: 'x'.repeat(1024 * 1024 + 1),
        }),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingBodyTooLarge);
    expect(service.requests).toHaveLength(0);
  });

  it('rejects a declared-oversized body before reading the stream', async () => {
    const service = new RecordingLicensingService();
    const exit = await Effect.runPromiseExit(
      proxyLicensingRequest(
        siteRequest('/api/licensing/api/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://omg.latham.cloud',
            'Content-Length': String(2 * 1024 * 1024),
          },
          body: 'x',
        }),
        identity,
        'server_admin_secret',
        service
      )
    );

    expect(failureOf(exit)).toBeInstanceOf(LicensingBodyTooLarge);
    expect(service.requests).toHaveLength(0);
  });
});
