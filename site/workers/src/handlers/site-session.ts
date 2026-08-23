import { Effect } from 'effect';
import { type Env, errorResponse, logAudit, respondFromEffect } from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import * as Schema from 'effect/Schema';
import {
  CustomerId,
  decodeCustomerRow,
  decodeSessionRow,
  SessionToken,
  SiteSessionRequestSchema,
  type SiteSessionWorkerResponse,
} from '../../../shared/site-session';
import { AdminUnauthorizedError, requireAdminSecret } from '../admin-secret';
import { casesHandled } from '../prelude';

/** D1 was unavailable or returned an unreadable row during site-session minting. */
class CustomerStoreUnavailable extends Error {
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

function storeOperation<A>(
  operation: CustomerStoreUnavailable['operation'],
  run: () => Promise<A>
): Effect.Effect<A, CustomerStoreUnavailable> {
  return Effect.tryPromise({
    try: run,
    catch: cause => new CustomerStoreUnavailable(operation, cause),
  });
}

/**
 * Mint or reuse a Worker session for a server-authenticated Better Auth user.
 *
 * @param request - Incoming POST with `X-Admin-Secret` and JSON body.
 * @param env - Worker bindings, including D1 and `ADMIN_API_SECRET`.
 * @returns The session wire payload, or a tagged site-session error.
 */
function mintSiteSession(
  request: Request,
  env: Env
): Effect.Effect<
  SiteSessionWorkerResponse,
  AdminUnauthorizedError | InvalidJsonBodyError | CustomerStoreUnavailable
> {
  return Effect.gen(function* () {
    yield* requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET);
    const body = yield* decodeJsonBody(request, SiteSessionRequestSchema);
    const customerRow = yield* storeOperation('findByEmail', () =>
      env.DB.prepare(`SELECT id, email, admin FROM customers WHERE email = ?`)
        .bind(body.email)
        .first()
    );
    let customer =
      customerRow === null
        ? null
        : yield* decodeCustomerRow(customerRow).pipe(
            Effect.mapError(cause => new CustomerStoreUnavailable('findByEmail', cause))
          );

    const admin = body.role === 'admin' ? 1 : 0;
    if (customer === null) {
      const customerId = Schema.decodeUnknownSync(CustomerId)(crypto.randomUUID());
      yield* storeOperation('insertCustomer', () =>
        env.DB.prepare(
          `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', ?)`
        )
          .bind(customerId, body.email, body.name ?? null, admin)
          .run()
      );
      yield* storeOperation('insertLicense', () =>
        env.DB.prepare(
          `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
           VALUES (?, ?, ?, 'free', 'active', 1)`
        )
          .bind(crypto.randomUUID(), customerId, crypto.randomUUID())
          .run()
      );
      yield* logAudit(env.DB, customerId, 'site.session_created', 'customer', customerId, request);
      customer = { id: customerId, email: body.email, admin };
    } else if (customer.admin !== admin) {
      const customerId = customer.id;
      yield* storeOperation('syncRole', () =>
        env.DB.prepare(`UPDATE customers SET admin = ? WHERE id = ?`).bind(admin, customerId).run()
      );
      customer = { ...customer, admin };
    }

    const sessionRow = yield* storeOperation('findSession', () =>
      env.DB.prepare(
        `SELECT token, expires_at FROM sessions
         WHERE customer_id = ? AND expires_at > datetime('now')
         ORDER BY created_at DESC LIMIT 1`
      )
        .bind(customer.id)
        .first()
    );
    if (sessionRow !== null) {
      const session = yield* decodeSessionRow(sessionRow).pipe(
        Effect.mapError(cause => new CustomerStoreUnavailable('findSession', cause))
      );
      return { token: session.token, expiresAt: session.expires_at, customerId: customer.id };
    }

    const sessionId = crypto.randomUUID();
    const token = Schema.decodeUnknownSync(SessionToken)(crypto.randomUUID());
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    yield* storeOperation('insertSession', () =>
      env.DB.prepare(
        `INSERT INTO sessions (id, customer_id, token, expires_at) VALUES (?, ?, ?, ?)`
      )
        .bind(sessionId, customer.id, token, expiresAt)
        .run()
    );
    yield* logAudit(env.DB, customer.id, 'site.session_created', 'session', sessionId, request);
    return { token, expiresAt, customerId: customer.id };
  });
}

/**
 * HTTP adapter for the internal site-session endpoint.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON session payload or a mapped error response.
 */
export function handleCreateSiteSession(request: Request, env: Env): Promise<Response> {
  return respondFromEffect(mintSiteSession(request, env), error => {
    switch (error._tag) {
      case 'AdminUnauthorizedError':
        return errorResponse(error.message, 401);
      case 'InvalidJsonBodyError':
        return errorResponse(error.message, 400);
      case 'CustomerStoreUnavailable':
        return errorResponse(error.message, 500);
      default:
        return casesHandled(error);
    }
  });
}
