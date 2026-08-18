import { Cause, Effect, Exit, Option } from 'effect';
import { type Env, jsonResponse, errorResponse, generateId, logAudit } from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import { Schema } from '@effect/schema';
import {
  AdminSessionRequestSchema,
  CustomerId,
  decodeCustomerRow,
  decodeSessionRow,
  SessionToken,
  type AdminSessionRequest,
  type AdminSessionWorkerResponse,
  type CustomerId as CustomerIdBrand,
  type CustomerRow,
  type EmailAddress,
  type SessionToken as SessionTokenBrand,
} from '../contracts/admin-session';
import { AdminUnauthorizedError, requireAdminSecret } from '../admin-secret';
import { casesHandled } from '../prelude';

/** The looked-up customer is not an admin. */
export class AdminForbiddenError extends Error {
  readonly _tag = 'AdminForbiddenError';
  constructor(readonly customerId: CustomerIdBrand) {
    super('User is not an admin');
  }
}

/** D1 was unavailable or returned an unreadable row during admin-session minting. */
export class CustomerStoreUnavailable extends Error {
  readonly _tag = 'CustomerStoreUnavailable';
  constructor(
    readonly operation:
      'findByEmail' | 'insertCustomer' | 'insertLicense' | 'findSession' | 'insertSession',
    readonly cause?: unknown
  ) {
    super(`Customer store unavailable during ${operation}`);
  }
}

type AdminSessionError =
  AdminUnauthorizedError | AdminForbiddenError | InvalidJsonBodyError | CustomerStoreUnavailable;

function brandGeneratedId<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: string
): Schema.Schema.Type<S> {
  const decoded = Schema.decodeUnknownSync(schema)(value);
  return decoded;
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

function provisionAdminCustomer(
  db: D1Database,
  body: AdminSessionRequest,
  request: Request
): Effect.Effect<CustomerRow, CustomerStoreUnavailable> {
  const customerId = brandGeneratedId(CustomerId, generateId());
  const company = body.name === undefined ? null : body.name;
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', 1)`
          )
          .bind(customerId, body.email, company)
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
          .bind(generateId(), customerId, crypto.randomUUID())
          .run(),
      catch: cause => new CustomerStoreUnavailable('insertLicense', cause),
    });
    yield* Effect.promise(() =>
      logAudit(db, customerId, 'admin.session_created', 'customer', customerId, request)
    );
    return { id: customerId, email: body.email, admin: 1 };
  });
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
): Effect.Effect<AdminSessionWorkerResponse, CustomerStoreUnavailable> {
  const sessionId = generateId();
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
    yield* Effect.promise(() =>
      logAudit(db, customerId, 'admin.session_created', 'session', sessionId, request)
    );
    return { token, expiresAt, customerId };
  });
}

/**
 * Mint or reuse a Worker admin session for a Better Auth admin.
 *
 * @param request - Incoming POST with `X-Admin-Secret` and JSON body.
 * @param env - Worker bindings, including D1 and `ADMIN_API_SECRET`.
 * @returns The session wire payload, or a tagged admin-session error.
 */
export function mintAdminSession(
  request: Request,
  env: Env
): Effect.Effect<AdminSessionWorkerResponse, AdminSessionError> {
  return Effect.gen(function* () {
    yield* requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET);
    const body = yield* decodeJsonBody(request, AdminSessionRequestSchema);
    const existing = yield* findCustomerByEmail(env.DB, body.email);
    const customer = existing ?? (yield* provisionAdminCustomer(env.DB, body, request));
    if (customer.admin !== 1) {
      yield* Effect.fail(new AdminForbiddenError(customer.id));
    }
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

function httpStatusFor(error: AdminSessionError): number {
  switch (error._tag) {
    case 'AdminUnauthorizedError':
      return 401;
    case 'InvalidJsonBodyError':
      return 400;
    case 'AdminForbiddenError':
      return 403;
    case 'CustomerStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

function responseFromExit(
  exit: Exit.Exit<AdminSessionWorkerResponse, AdminSessionError>
): Response {
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
 * HTTP adapter for `POST /api/admin/create-session`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON session payload or a mapped error response.
 */
export async function handleCreateAdminSession(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(mintAdminSession(request, env));
  return responseFromExit(exit);
}
