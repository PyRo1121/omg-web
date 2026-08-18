import { Cause, Effect, Exit, Option } from 'effect';
import { Schema } from '@effect/schema';
import {
  AdminSessionParseError,
  AdminSessionRequestSchema,
  decodeAdminSessionWorkerResponse,
  EmailAddress,
  type AdminSessionClientResponse,
  type AdminSessionRequest,
} from '~/lib/contracts/admin-session';
import { casesHandled } from '~/lib/prelude';

/** No Better Auth session is present. */
export class AuthBridgeUnauthorized extends Error {
  readonly _tag = 'AuthBridgeUnauthorized';
  constructor() {
    super('Unauthorized');
  }
}

/** The Better Auth user is not an admin. */
export class AuthBridgeForbidden extends Error {
  readonly _tag = 'AuthBridgeForbidden';
  constructor() {
    super('Forbidden - Admin access required');
  }
}

/** A required auth-bridge binding is missing or invalid. */
export class AuthBridgeMisconfigured extends Error {
  readonly _tag = 'AuthBridgeMisconfigured';
  constructor(readonly missing: 'WORKERS_API_URL' | 'ADMIN_API_SECRET' | 'cloudflare_env') {
    super('Admin API not configured');
  }
}

/** The Worker rejected the create-session request. */
export class AuthBridgeWorkerRejected extends Error {
  readonly _tag = 'AuthBridgeWorkerRejected';
  constructor(readonly status: number) {
    super('Failed to create workers session');
  }
}

/** The outbound Worker request failed before a response was parsed. */
export class AuthBridgeNetworkError extends Error {
  readonly _tag = 'AuthBridgeNetworkError';
  constructor(readonly cause?: unknown) {
    super('Failed to create workers session');
  }
}

/** Looking up the Better Auth role failed. */
export class AuthBridgeStoreUnavailable extends Error {
  readonly _tag = 'AuthBridgeStoreUnavailable';
  constructor(readonly cause?: unknown) {
    super('Internal server error');
  }
}

export type AuthBridgeError =
  | AuthBridgeUnauthorized
  | AuthBridgeForbidden
  | AuthBridgeMisconfigured
  | AuthBridgeWorkerRejected
  | AuthBridgeNetworkError
  | AuthBridgeStoreUnavailable
  | AdminSessionParseError;

/** A Better Auth user minting a Worker session. */
export interface BridgeUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** Looks up the Better Auth role for a user id. */
export interface AdminRoleLookup {
  lookupRole(userId: string): Effect.Effect<'admin' | 'user' | null, AuthBridgeStoreUnavailable>;
}

/** Posts a create-session request to the Worker. */
export interface WorkerSessionPoster {
  post(
    url: string,
    secret: string,
    body: AdminSessionRequest
  ): Effect.Effect<Response, AuthBridgeNetworkError>;
}

const WorkersApiUrl = Schema.String.pipe(
  Schema.pattern(/^https?:\/\/.+/),
  Schema.brand('WorkersApiUrl')
);
type WorkersApiUrl = Schema.Schema.Type<typeof WorkersApiUrl>;

const AdminApiSecret = Schema.String.pipe(Schema.minLength(1), Schema.brand('AdminApiSecret'));
type AdminApiSecret = Schema.Schema.Type<typeof AdminApiSecret>;

/**
 * Parse the Worker base URL from an untrusted env binding.
 *
 * @param value - `WORKERS_API_URL` as provided by Cloudflare.
 * @returns A branded URL, or `AuthBridgeMisconfigured`.
 */
export function parseWorkersApiUrl(
  value: string | undefined
): Effect.Effect<WorkersApiUrl, AuthBridgeMisconfigured> {
  return Schema.decodeUnknown(WorkersApiUrl)(value).pipe(
    Effect.mapError(() => new AuthBridgeMisconfigured('WORKERS_API_URL'))
  );
}

/**
 * Parse the admin secret from an untrusted env binding.
 *
 * @param value - `ADMIN_API_SECRET` as provided by Cloudflare.
 * @returns A branded secret, or `AuthBridgeMisconfigured`.
 */
export function parseAdminApiSecret(
  value: string | undefined
): Effect.Effect<AdminApiSecret, AuthBridgeMisconfigured> {
  return Schema.decodeUnknown(AdminApiSecret)(value).pipe(
    Effect.mapError(() => new AuthBridgeMisconfigured('ADMIN_API_SECRET'))
  );
}

/**
 * Mint a Worker admin session for a Better Auth admin.
 */
export class AdminSessionBridge {
  constructor(
    private readonly roles: AdminRoleLookup,
    private readonly poster: WorkerSessionPoster,
    private readonly workersApiUrl: WorkersApiUrl,
    private readonly adminSecret: AdminApiSecret
  ) {}

  /**
   * Create or reuse a Worker session for `user`.
   *
   * @param user - Authenticated Better Auth user.
   * @returns The client session payload, or a tagged bridge error.
   */
  mint(
    user: BridgeUser
  ): Effect.Effect<AdminSessionClientResponse, Exclude<AuthBridgeError, AuthBridgeUnauthorized>> {
    const roles = this.roles;
    const poster = this.poster;
    const workersApiUrl = this.workersApiUrl;
    const adminSecret = this.adminSecret;
    return Effect.gen(function* () {
      const email = yield* Schema.decodeUnknown(EmailAddress)(user.email).pipe(
        Effect.mapError(
          cause => new AdminSessionParseError('Authenticated user email is invalid', cause)
        )
      );
      const role = yield* roles.lookupRole(user.id);
      if (role !== 'admin') {
        yield* Effect.fail(new AuthBridgeForbidden());
      }
      const requestBody: AdminSessionRequest = yield* Schema.decodeUnknown(
        AdminSessionRequestSchema
      )({
        email,
        name: user.name,
        betterAuthUserId: user.id,
      }).pipe(
        Effect.mapError(
          cause => new AdminSessionParseError('Admin session request is invalid', cause)
        )
      );
      const response = yield* poster.post(
        `${workersApiUrl}/api/admin/create-session`,
        adminSecret,
        requestBody
      );
      if (!response.ok) {
        yield* Effect.fail(new AuthBridgeWorkerRejected(response.status));
      }
      const payload = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: cause => new AuthBridgeNetworkError(cause),
      });
      const workerSession = yield* decodeAdminSessionWorkerResponse(payload);
      return { token: workerSession.token, expiresAt: workerSession.expiresAt };
    });
  }
}

/** Posts create-session using `fetch`. */
export class FetchWorkerSessionPoster implements WorkerSessionPoster {
  post(
    url: string,
    secret: string,
    body: AdminSessionRequest
  ): Effect.Effect<Response, AuthBridgeNetworkError> {
    return Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': secret,
          },
          body: JSON.stringify(body),
        }),
      catch: cause => new AuthBridgeNetworkError(cause),
    });
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    },
  });
}

function httpStatusFor(error: AuthBridgeError): number {
  switch (error._tag) {
    case 'AuthBridgeUnauthorized':
      return 401;
    case 'AuthBridgeForbidden':
      return 403;
    case 'AdminSessionParseError':
    case 'AuthBridgeWorkerRejected':
      return 502;
    case 'AuthBridgeMisconfigured':
    case 'AuthBridgeNetworkError':
    case 'AuthBridgeStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

/**
 * Map a bridge Effect exit to an HTTP response without leaking secrets.
 *
 * @param exit - The completed mint attempt.
 * @returns JSON success or a safe error payload.
 */
export function responseFromAuthBridgeExit(
  exit: Exit.Exit<AdminSessionClientResponse, AuthBridgeError>
): Response {
  return Exit.match(exit, {
    onSuccess: session =>
      new Response(JSON.stringify({ token: session.token, expiresAt: session.expiresAt }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return jsonError(error.message, httpStatusFor(error));
      }
      return jsonError('Internal server error', 500);
    },
  });
}
