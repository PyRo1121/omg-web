import { Cause, Effect, Exit, Option } from 'effect';
import { type Env, jsonResponse, errorResponse, logAudit } from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import * as Schema from 'effect/Schema';
import {
  CustomerId,
  decodeCustomerRow,
  decodeSessionRow,
  SessionToken,
  SiteSessionRequestSchema,
  type SiteSessionRequest,
  type SiteSessionWorkerResponse,
  type CustomerId as CustomerIdBrand,
  type CustomerRow,
  type EmailAddress,
  type SessionToken as SessionTokenBrand,
  type SiteSessionRole,
} from '../contracts/site-session';
import { AdminUnauthorizedError, requireAdminSecret } from '../admin-secret';
import { casesHandled } from '../prelude';

/** D1 was unavailable or returned an unreadable row during site-session minting. */
export class CustomerStoreUnavailable extends Error {
  readonly _tag = 'CustomerStoreUnavailable';
  constructor(
    readonly operation:
      | 'findByEmail'
      | 'insertCustomer'
      | 'insertLicense'
      | 'syncRole'
      | 'findSession'
      | 'insertSession',
    override readonly cause?: unknown
  ) {
    super(`Customer store unavailable during ${operation}`);
  }
}

type SiteSessionError = AdminUnauthorizedError | InvalidJsonBodyError | CustomerStoreUnavailable;

function brandGeneratedId<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: string
): Schema.Schema.Type<S> {
  return Schema.decodeUnknownSync(schema)(value);
}

function findCustomerByEmail(
  db: D1Database,
  email: EmailAddress
): Effect.Effect<CustomerRow | null, CustomerStoreUnavailable> {
  return Effect.tryPromise({
    try: () =>
      db.prepare(`SELECT id, email, admin FROM customers WHERE email = ?`).bind(email).first(),
    catch: cause => new CustomerStoreUnavailable('findByEmail', cause),
  }).pipe(
    Effect.flatMap(row => {
      if (row === null) {
        return Effect.succeed(null);
      }
      return decodeCustomerRow(row).pipe(
        Effect.mapError(cause => new CustomerStoreUnavailable('findByEmail', cause))
      );
    })
  );
}

function provisionSiteCustomer(
  db: D1Database,
  body: SiteSessionRequest,
  request: Request
): Effect.Effect<CustomerRow, CustomerStoreUnavailable> {
  const customerId = brandGeneratedId(CustomerId, crypto.randomUUID());
  const company = body.name === undefined ? null : body.name;
  const admin = body.role === 'admin' ? 1 : 0;
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', ?)`
          )
          .bind(customerId, body.email, company, admin)
          .run(),
      catch: cause => new CustomerStoreUnavailable('insertCustomer', cause),
    });
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
             VALUES (?, ?, ?, 'free', 'active', 1)`
          )
          .bind(crypto.randomUUID(), customerId, crypto.randomUUID())
          .run(),
      catch: cause => new CustomerStoreUnavailable('insertLicense', cause),
    });
    yield* logAudit(db, customerId, 'site.session_created', 'customer', customerId, request);
    return { id: customerId, email: body.email, admin };
  });
}

function syncCustomerRole(
  db: D1Database,
  customer: CustomerRow,
  role: SiteSessionRole
): Effect.Effect<CustomerRow, CustomerStoreUnavailable> {
  const admin = role === 'admin' ? 1 : 0;
  if (customer.admin === admin) {
    return Effect.succeed(customer);
  }
  return Effect.tryPromise({
    try: () =>
      db.prepare(`UPDATE customers SET admin = ? WHERE id = ?`).bind(admin, customer.id).run(),
    catch: cause => new CustomerStoreUnavailable('syncRole', cause),
  }).pipe(Effect.map(() => ({ ...customer, admin })));
}

function findActiveSession(
  db: D1Database,
  customerId: CustomerIdBrand
): Effect.Effect<
  { readonly token: SessionTokenBrand; readonly expiresAt: string } | null,
  CustomerStoreUnavailable
> {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `SELECT token, expires_at FROM sessions
           WHERE customer_id = ? AND expires_at > datetime('now')
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(customerId)
        .first(),
    catch: cause => new CustomerStoreUnavailable('findSession', cause),
  }).pipe(
    Effect.flatMap(row => {
      if (row === null) {
        return Effect.succeed(null);
      }
      return decodeSessionRow(row).pipe(
        Effect.mapError(cause => new CustomerStoreUnavailable('findSession', cause)),
        Effect.map(session => ({ token: session.token, expiresAt: session.expires_at }))
      );
    })
  );
}

function insertSession(
  db: D1Database,
  customerId: CustomerIdBrand,
  request: Request
): Effect.Effect<SiteSessionWorkerResponse, CustomerStoreUnavailable> {
  const sessionId = crypto.randomUUID();
  const token = brandGeneratedId(SessionToken, crypto.randomUUID());
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(`INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`)
          .bind(sessionId, customerId, token, expiresAt)
          .run(),
      catch: cause => new CustomerStoreUnavailable('insertSession', cause),
    });
    yield* logAudit(db, customerId, 'site.session_created', 'session', sessionId, request);
    return { token, expiresAt, customerId };
  });
}

/**
 * Mint or reuse a Worker session for a server-authenticated Better Auth user.
 *
 * @param request - Incoming POST with `X-Admin-Secret` and JSON body.
 * @param env - Worker bindings, including D1 and `ADMIN_API_SECRET`.
 * @returns The session wire payload, or a tagged site-session error.
 */
export function mintSiteSession(
  request: Request,
  env: Env
): Effect.Effect<SiteSessionWorkerResponse, SiteSessionError> {
  return Effect.gen(function* () {
    yield* requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET);
    const body = yield* decodeJsonBody(request, SiteSessionRequestSchema);
    const existing = yield* findCustomerByEmail(env.DB, body.email);
    const projected = existing ?? (yield* provisionSiteCustomer(env.DB, body, request));
    const customer = yield* syncCustomerRole(env.DB, projected, body.role);
    const session = yield* findActiveSession(env.DB, customer.id);
    if (session !== null) {
      return {
        token: session.token,
        expiresAt: session.expiresAt,
        customerId: customer.id,
      };
    }
    return yield* insertSession(env.DB, customer.id, request);
  });
}

function httpStatusFor(error: SiteSessionError): number {
  switch (error._tag) {
    case 'AdminUnauthorizedError':
      return 401;
    case 'InvalidJsonBodyError':
      return 400;
    case 'CustomerStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

function responseFromExit(exit: Exit.Exit<SiteSessionWorkerResponse, SiteSessionError>): Response {
  return Exit.match(exit, {
    onSuccess: session => jsonResponse(session),
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return errorResponse(error.message, httpStatusFor(error));
      }
      return errorResponse('Internal server error', 500);
    },
  });
}

/**
 * HTTP adapter for the internal site-session endpoint.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON session payload or a mapped error response.
 */
export async function handleCreateSiteSession(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(mintSiteSession(request, env));
  return responseFromExit(exit);
}
