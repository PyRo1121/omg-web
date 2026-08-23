import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import { isSiteBffRoute, LicensingRoutes } from '../../shared/licensing-routes';
import {
  decodeSiteSessionWorkerResponse,
  EmailAddress,
  type SiteSessionWorkerResponse,
} from '../../shared/site-session';

const INTERNAL_WORKER_ORIGIN = 'https://omg-saas.internal';
const BFF_PATH_PREFIX = '/api/licensing';
const MAX_PROXY_BODY_BYTES = 1024 * 1024;

const LicensingIdentitySchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  email: EmailAddress,
  name: Schema.String,
  role: Schema.Literal('admin', 'user'),
});

/** Untrusted Better Auth identity accepted at the BFF boundary. */
export interface LicensingIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'user';
}

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
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

/** The service binding failed before returning a response. */
export class LicensingServiceUnavailable extends Error {
  readonly _tag = 'LicensingServiceUnavailable';
  constructor(override readonly cause?: unknown) {
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
  constructor(override readonly cause?: unknown) {
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

function licensingParse<A, E>(
  parse: Effect.Effect<A, E>,
  reason: string
): Effect.Effect<A, LicensingBffParseError> {
  return parse.pipe(Effect.mapError(cause => new LicensingBffParseError(reason, cause)));
}

function requireSameOrigin(inbound: Request): Effect.Effect<void, LicensingSameOriginRequired> {
  if (inbound.method === 'GET' || inbound.method === 'HEAD') {
    return Effect.void;
  }
  const url = URL.parse(inbound.url);
  return url !== null && inbound.headers.get('Origin') === url.origin
    ? Effect.void
    : Effect.fail(new LicensingSameOriginRequired());
}

function downstreamUrl(inbound: Request): Effect.Effect<URL, LicensingRouteRejected> {
  const source = URL.parse(inbound.url);
  if (source === null) {
    return Effect.fail(new LicensingRouteRejected('', inbound.method));
  }
  if (!source.pathname.startsWith(`${BFF_PATH_PREFIX}/`)) {
    return Effect.fail(new LicensingRouteRejected(source.pathname, inbound.method));
  }
  const path = source.pathname.slice(BFF_PATH_PREFIX.length);
  if (!isSiteBffRoute(inbound.method, path)) {
    return Effect.fail(new LicensingRouteRejected(path, inbound.method));
  }
  const target = URL.parse(path, INTERNAL_WORKER_ORIGIN);
  if (target === null) {
    return Effect.fail(new LicensingRouteRejected(path, inbound.method));
  }
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
    const parsedIdentity = yield* licensingParse(
      Schema.decodeUnknown(LicensingIdentitySchema)(identity),
      'Licensing identity is invalid'
    );
    const parsedSecret = yield* licensingParse(
      Schema.decodeUnknown(Schema.String.pipe(Schema.minLength(1)))(secret),
      'Licensing secret is invalid'
    );
    const response = yield* serviceFetch(
      service,
      new Request(`${INTERNAL_WORKER_ORIGIN}${LicensingRoutes.internalSiteSession.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': parsedSecret,
          'X-Internal-Call': 'service-binding',
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
    return yield* licensingParse(
      decodeSiteSessionWorkerResponse(payload),
      'Worker session response is invalid'
    );
  });
}

function readBoundedBody(
  inbound: Request
): Effect.Effect<ArrayBuffer | undefined, LicensingBodyTooLarge | LicensingBodyReadError> {
  const stream = inbound.body;
  if (stream === null) {
    return Effect.succeed(undefined);
  }
  return Effect.tryPromise({
    try: async () => {
      const reader = stream.getReader();
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

    const requestInit: RequestInit = {
      method: inbound.method,
      headers,
    };
    if (body !== undefined) {
      requestInit.body = body;
    }
    const outbound = new Request(target, requestInit);
    const response = yield* serviceFetch(service, outbound);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Set-Cookie');
    responseHeaders.delete('Access-Control-Allow-Origin');
    responseHeaders.delete('Access-Control-Allow-Credentials');
    responseHeaders.set('Cache-Control', 'private, no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  });
}
