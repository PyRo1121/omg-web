import { Effect } from 'effect';
import { Schema } from '@effect/schema';
import {
  decodeSiteSessionWorkerResponse,
  EmailAddress,
  type SiteSessionWorkerResponse,
} from './contracts/site-session';

const INTERNAL_WORKER_ORIGIN = 'https://omg-saas.internal';
const BFF_PATH_PREFIX = '/api/licensing';
const MAX_PROXY_BODY_BYTES = 1024 * 1024;

interface LicensingRoute {
  readonly method: string;
  readonly path: string;
}

const LICENSING_ROUTES: readonly LicensingRoute[] = [
  { method: 'GET', path: '/api/dashboard' },
  { method: 'PUT', path: '/api/user/profile' },
  { method: 'POST', path: '/api/license/regenerate' },
  { method: 'POST', path: '/api/machines/revoke' },
  { method: 'GET', path: '/api/sessions' },
  { method: 'POST', path: '/api/sessions/revoke' },
  { method: 'GET', path: '/api/audit-log' },
  { method: 'GET', path: '/api/team/members' },
  { method: 'GET', path: '/api/team/policies' },
  { method: 'GET', path: '/api/team/notifications' },
  { method: 'GET', path: '/api/team/audit-logs' },
  { method: 'POST', path: '/api/team/revoke' },
  { method: 'GET', path: '/api/admin/dashboard' },
  { method: 'GET', path: '/api/admin/users' },
  { method: 'GET', path: '/api/admin/user' },
  { method: 'PUT', path: '/api/admin/user' },
  { method: 'GET', path: '/api/admin/activity' },
  { method: 'GET', path: '/api/admin/health' },
  { method: 'GET', path: '/api/admin/cohorts' },
  { method: 'GET', path: '/api/admin/revenue' },
  { method: 'GET', path: '/api/admin/analytics' },
  { method: 'GET', path: '/api/admin/export/users' },
  { method: 'GET', path: '/api/admin/export/usage' },
  { method: 'GET', path: '/api/admin/export/audit' },
  { method: 'GET', path: '/api/admin/audit-log' },
  { method: 'GET', path: '/api/admin/notes' },
  { method: 'POST', path: '/api/admin/notes' },
  { method: 'PUT', path: '/api/admin/notes' },
  { method: 'DELETE', path: '/api/admin/notes' },
  { method: 'GET', path: '/api/admin/tags' },
  { method: 'POST', path: '/api/admin/tags' },
  { method: 'GET', path: '/api/admin/customer-tags' },
  { method: 'POST', path: '/api/admin/customer-tags' },
  { method: 'DELETE', path: '/api/admin/customer-tags' },
  { method: 'GET', path: '/api/admin/customer-health' },
  { method: 'GET', path: '/api/admin/advanced-metrics' },
  { method: 'GET', path: '/api/admin/firehose' },
  { method: 'GET', path: '/api/insights' },
  { method: 'GET', path: '/api/docs/analytics/dashboard' },
  { method: 'GET', path: '/api/site/analytics/geo' },
  { method: 'GET', path: '/api/site/analytics/realtime' },
  { method: 'GET', path: '/api/site/analytics/overview' },
  { method: 'POST', path: '/api/billing/portal' },
  { method: 'POST', path: '/api/billing/checkout' },
  { method: 'POST', path: '/api/admin/stripe/sync' },
  { method: 'GET', path: '/api/admin/stripe/metrics' },
];

const LicensingIdentitySchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: EmailAddress,
  name: Schema.String,
  role: Schema.Literal('admin', 'user'),
});
type ParsedLicensingIdentity = Schema.Schema.Type<typeof LicensingIdentitySchema>;

/** Untrusted Better Auth identity accepted at the BFF boundary. */
export interface LicensingIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'user';
}

const LicensingSecret = Schema.String.pipe(Schema.minLength(1));

/** Service binding surface used by the same-origin licensing BFF. */
export interface LicensingService {
  fetch(request: Request): Promise<Response>;
}

/** The browser attempted to proxy a route not owned by the authenticated BFF. */
export class LicensingRouteRejected extends Error {
  readonly _tag = 'LicensingRouteRejected';
  constructor(
    readonly path: string,
    readonly method: string
  ) {
    super('Licensing route is not allowed');
  }
}

/** A state-changing request did not originate from the site itself. */
export class LicensingSameOriginRequired extends Error {
  readonly _tag = 'LicensingSameOriginRequired';
  constructor() {
    super('Same-origin request required');
  }
}

/** A required identity or secret failed boundary validation. */
export class LicensingBffParseError extends Error {
  readonly _tag = 'LicensingBffParseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** The service binding failed before returning a response. */
export class LicensingServiceUnavailable extends Error {
  readonly _tag = 'LicensingServiceUnavailable';
  constructor(readonly cause?: unknown) {
    super('Licensing service unavailable');
  }
}

/** The browser request exceeded the BFF's bounded body limit. */
export class LicensingBodyTooLarge extends Error {
  readonly _tag = 'LicensingBodyTooLarge';
  constructor() {
    super('Licensing request body is too large');
  }
}

/** The browser request body could not be read for forwarding. */
export class LicensingBodyReadError extends Error {
  readonly _tag = 'LicensingBodyReadError';
  constructor(readonly cause?: unknown) {
    super('Licensing request body could not be read');
  }
}

/** The licensing Worker rejected session minting or the proxied request. */
export class LicensingWorkerRejected extends Error {
  readonly _tag = 'LicensingWorkerRejected';
  constructor(
    readonly operation: 'session',
    readonly status: number
  ) {
    super('Licensing Worker rejected the internal session request');
  }
}

export type LicensingBffError =
  | LicensingRouteRejected
  | LicensingSameOriginRequired
  | LicensingBffParseError
  | LicensingServiceUnavailable
  | LicensingBodyTooLarge
  | LicensingBodyReadError
  | LicensingWorkerRejected;

function routeAllowed(method: string, path: string): boolean {
  return LICENSING_ROUTES.some(route => route.method === method && route.path === path);
}

function requireSameOrigin(inbound: Request): Effect.Effect<void, LicensingSameOriginRequired> {
  if (inbound.method === 'GET' || inbound.method === 'HEAD') {
    return Effect.void;
  }
  const url = new URL(inbound.url);
  return inbound.headers.get('Origin') === url.origin
    ? Effect.void
    : Effect.fail(new LicensingSameOriginRequired());
}

function downstreamUrl(inbound: Request): Effect.Effect<URL, LicensingRouteRejected> {
  const source = new URL(inbound.url);
  if (!source.pathname.startsWith(`${BFF_PATH_PREFIX}/`)) {
    return Effect.fail(new LicensingRouteRejected(source.pathname, inbound.method));
  }
  const path = source.pathname.slice(BFF_PATH_PREFIX.length);
  if (!routeAllowed(inbound.method, path)) {
    return Effect.fail(new LicensingRouteRejected(path, inbound.method));
  }
  const target = new URL(path, INTERNAL_WORKER_ORIGIN);
  target.search = source.search;
  return Effect.succeed(target);
}

function serviceFetch(
  service: LicensingService,
  outbound: Request
): Effect.Effect<Response, LicensingServiceUnavailable> {
  return Effect.tryPromise({
    try: () => service.fetch(outbound),
    catch: cause => new LicensingServiceUnavailable(cause),
  });
}

function mintWorkerSession(
  identity: LicensingIdentity,
  secret: string,
  service: LicensingService
): Effect.Effect<SiteSessionWorkerResponse, LicensingBffError> {
  return Effect.gen(function* () {
    const parsedIdentity: ParsedLicensingIdentity = yield* Schema.decodeUnknown(
      LicensingIdentitySchema
    )(identity).pipe(
      Effect.mapError(cause => new LicensingBffParseError('Licensing identity is invalid', cause))
    );
    const parsedSecret = yield* Schema.decodeUnknown(LicensingSecret)(secret).pipe(
      Effect.mapError(cause => new LicensingBffParseError('Licensing secret is invalid', cause))
    );
    const response = yield* serviceFetch(
      service,
      new Request(`${INTERNAL_WORKER_ORIGIN}/api/internal/site-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': parsedSecret,
        },
        body: JSON.stringify({
          email: parsedIdentity.email,
          name: parsedIdentity.name,
          betterAuthUserId: parsedIdentity.id,
          role: parsedIdentity.role,
        }),
      })
    );
    if (!response.ok) {
      return yield* Effect.fail(new LicensingWorkerRejected('session', response.status));
    }
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new LicensingBffParseError('Worker session response is not JSON', cause),
    });
    return yield* decodeSiteSessionWorkerResponse(payload).pipe(
      Effect.mapError(
        cause => new LicensingBffParseError('Worker session response is invalid', cause)
      )
    );
  });
}

function readBoundedBody(
  inbound: Request
): Effect.Effect<ArrayBuffer | undefined, LicensingBodyTooLarge | LicensingBodyReadError> {
  if (inbound.body === null) {
    return Effect.succeed(undefined);
  }
  return Effect.tryPromise({
    try: async () => {
      const reader = inbound.body?.getReader();
      if (reader === undefined) {
        return undefined;
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        total += next.value.byteLength;
        if (total > MAX_PROXY_BODY_BYTES) {
          throw new LicensingBodyTooLarge();
        }
        chunks.push(next.value);
      }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return body.buffer;
    },
    catch: cause =>
      cause instanceof LicensingBodyTooLarge ? cause : new LicensingBodyReadError(cause),
  });
}

function sanitizedWorkerResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Authenticate a same-origin browser request with Better Auth identity, mint a server-only Worker
 * session, and proxy one explicitly allowlisted licensing route through a service binding.
 */
export function proxyLicensingRequest(
  inbound: Request,
  identity: LicensingIdentity,
  secret: string,
  service: LicensingService
): Effect.Effect<Response, LicensingBffError> {
  return Effect.gen(function* () {
    const target = yield* downstreamUrl(inbound);
    yield* requireSameOrigin(inbound);
    const body = yield* readBoundedBody(inbound);
    const session = yield* mintWorkerSession(identity, secret, service);

    const headers = new Headers();
    const contentType = inbound.headers.get('Content-Type');
    const accept = inbound.headers.get('Accept');
    if (contentType !== null) {
      headers.set('Content-Type', contentType);
    }
    if (accept !== null) {
      headers.set('Accept', accept);
    }
    headers.set('Authorization', `Bearer ${session.token}`);

    const outbound = new Request(target, {
      method: inbound.method,
      headers,
      body,
    });
    const response = yield* serviceFetch(service, outbound);
    return sanitizedWorkerResponse(response);
  });
}
