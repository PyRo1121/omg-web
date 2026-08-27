import { Effect } from 'effect';
import {
  type Env,
  enforceRateLimit,
  errorResponse,
  generateToken,
  logAudit,
  rateLimitClientIp,
  respondFromEffect,
} from '../api';
import { decodeJsonBody, type InvalidJsonBodyError } from '../body';
import * as Schema from 'effect/Schema';
import {
  decodeCustomerRow,
  decodeSessionRow,
  SessionToken,
  SiteSessionRequestSchema,
  type SiteSessionWorkerResponse,
} from '../../../shared/site-session';
import { AdminUnauthorizedError } from '../admin-secret';
import { casesHandled, timingSafeEqualUtf8 } from '../prelude';

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

function requireSiteBffSecret(
  provided: string | null,
  env: Pick<Env, 'ADMIN_API_SECRET' | 'SVELTE_BFF_SECRET'>
): Effect.Effect<void, AdminUnauthorizedError> {
  if (provided === null) {
    return Effect.fail(new AdminUnauthorizedError());
  }
  const expectedSecrets = [env.ADMIN_API_SECRET, env.SVELTE_BFF_SECRET];
  const matches = expectedSecrets
    .map(
      expected =>
        expected !== undefined && expected.length > 0 && timingSafeEqualUtf8(provided, expected)
    )
    .some(Boolean);
  return matches ? Effect.void : Effect.fail(new AdminUnauthorizedError());
}

/**
 * Mint or reuse a Worker session for a server-authenticated Better Auth user.
 *
 * @param request - Incoming POST with `X-Admin-Secret` and JSON body.
 * @param env - Worker bindings, including D1 and caller-specific BFF secrets.
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
    yield* requireSiteBffSecret(request.headers.get('X-Admin-Secret'), env);
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
      // Unique constraint on email + ON CONFLICT DO NOTHING closes the
      // find-then-insert race. Note: miniflare/D1 .run() meta may not carry
      // `changes`, so success is determined by re-selecting, never by meta.
      yield* storeOperation('insertCustomer', () =>
        env.DB.prepare(
          `INSERT INTO customers (id, email, company, tier, admin) VALUES (?, ?, ?, 'free', ?)
           ON CONFLICT (email) DO NOTHING`
        )
          .bind(crypto.randomUUID(), body.email, body.name ?? null, admin)
          .run()
      );
      const adoptedRow = yield* storeOperation('findByEmail', () =>
        env.DB.prepare(`SELECT id, email, admin FROM customers WHERE email = ?`)
          .bind(body.email)
          .first()
      );
      if (adoptedRow === null) {
        return yield* Effect.fail(new CustomerStoreUnavailable('findByEmail'));
      }
      const adopted = yield* decodeCustomerRow(adoptedRow).pipe(
        Effect.mapError(cause => new CustomerStoreUnavailable('findByEmail', cause))
      );
      customer = adopted;
      // The unique customer index arbitrates concurrent auth and BFF provisioning.
      const insertedLicense = yield* storeOperation('insertLicense', () =>
        env.DB.prepare(
          `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
           VALUES (?, ?, ?, 'free', 'active', 1)
           ON CONFLICT (customer_id) DO NOTHING
           RETURNING id`
        )
          .bind(crypto.randomUUID(), adopted.id, crypto.randomUUID())
          .first()
      );
      if (insertedLicense !== null) {
        yield* logAudit(
          env.DB,
          adopted.id,
          'site.session_created',
          'customer',
          adopted.id,
          request
        );
      }
    }

    if (customer.admin !== admin) {
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
    const token = Schema.decodeUnknownSync(SessionToken)(generateToken());
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
export async function handleCreateSiteSession(request: Request, env: Env): Promise<Response> {
  // Defense-in-depth: this route is publicly reachable; only the BFF service
  // binding should ever call it.
  if (request.headers.get('X-Internal-Call') !== 'service-binding') {
    return errorResponse('Not found', 404);
  }
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `internal_site_session:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }
  return respondFromEffect(mintSiteSession(request, env), error => {
    switch (error._tag) {
      case 'AdminUnauthorizedError':
        return errorResponse(error.message, 401);
      case 'InvalidJsonBodyError':
        return errorResponse(error.message, 400);
      case 'CustomerStoreUnavailable':
        return errorResponse('Site session unavailable', 500);
      default:
        return casesHandled(error);
    }
  });
}
