import { Cause, Effect, Exit, Option } from 'effect';
import { Schema } from '@effect/schema';
import { type Env, jsonResponse, errorResponse, generateId, logAudit } from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import { AdminUnauthorizedError, requireAdminSecret } from '../admin-secret';
import {
  CustomerId,
  LicenseKey,
  ProvisionRequestSchema,
  decodeProvisionCustomerRow,
  decodeProvisionLicenseRow,
  type CustomerId as CustomerIdBrand,
  type EmailAddress,
  type LicenseKey as LicenseKeyBrand,
  type ProvisionCustomerRow,
  type ProvisionRequest,
  type ProvisionResponse,
} from '../contracts/provision';
import { casesHandled } from '../prelude';

/** D1 was unavailable or returned an unreadable row during provision. */
export class ProvisionStoreUnavailable extends Error {
  readonly _tag = 'ProvisionStoreUnavailable';
  constructor(
    readonly operation: 'findByEmail' | 'insertCustomer' | 'insertLicense' | 'findLicense',
    readonly cause?: unknown
  ) {
    super(`Customer store unavailable during ${operation}`);
  }
}

type ProvisionError = AdminUnauthorizedError | InvalidJsonBodyError | ProvisionStoreUnavailable;

function brandGeneratedId<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: string
): Schema.Schema.Type<S> {
  return Schema.decodeUnknownSync(schema)(value);
}

function findCustomerByEmail(
  db: D1Database,
  email: EmailAddress
): Effect.Effect<ProvisionCustomerRow | null, ProvisionStoreUnavailable> {
  return Effect.tryPromise({
    try: () => db.prepare(`SELECT id, email FROM customers WHERE email = ?`).bind(email).first(),
    catch: cause => new ProvisionStoreUnavailable('findByEmail', cause),
  }).pipe(
    Effect.flatMap(row => {
      if (row === null) {
        return Effect.succeed(null);
      }
      return decodeProvisionCustomerRow(row).pipe(
        Effect.mapError(cause => new ProvisionStoreUnavailable('findByEmail', cause))
      );
    })
  );
}

function findActiveLicense(
  db: D1Database,
  customerId: CustomerIdBrand
): Effect.Effect<{ readonly license_key: LicenseKeyBrand } | null, ProvisionStoreUnavailable> {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `SELECT license_key FROM licenses WHERE customer_id = ? AND status = 'active' LIMIT 1`
        )
        .bind(customerId)
        .first(),
    catch: cause => new ProvisionStoreUnavailable('findLicense', cause),
  }).pipe(
    Effect.flatMap(row => {
      if (row === null) {
        return Effect.succeed(null);
      }
      return decodeProvisionLicenseRow(row).pipe(
        Effect.mapError(cause => new ProvisionStoreUnavailable('findLicense', cause))
      );
    })
  );
}

function insertLicense(
  db: D1Database,
  customerId: CustomerIdBrand
): Effect.Effect<LicenseKeyBrand, ProvisionStoreUnavailable> {
  const licenseKey = brandGeneratedId(LicenseKey, crypto.randomUUID());
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_seats)
           VALUES (?, ?, ?, 'free', 'active', 1)`
        )
        .bind(generateId(), customerId, licenseKey)
        .run(),
    catch: cause => new ProvisionStoreUnavailable('insertLicense', cause),
  }).pipe(Effect.as(licenseKey));
}

function insertCustomerWithLicense(
  db: D1Database,
  body: ProvisionRequest,
  request: Request
): Effect.Effect<ProvisionResponse, ProvisionStoreUnavailable> {
  const customerId = brandGeneratedId(CustomerId, generateId());
  const company = body.name === undefined ? null : body.name;
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(`INSERT INTO customers (id, email, company, tier) VALUES (?, ?, ?, 'free')`)
          .bind(customerId, body.email, company)
          .run(),
      catch: cause => new ProvisionStoreUnavailable('insertCustomer', cause),
    });
    const licenseKey = yield* insertLicense(db, customerId);
    yield* Effect.promise(() =>
      logAudit(db, customerId, 'user.provisioned', 'customer', customerId, request)
    );
    return {
      success: true as const,
      customerId,
      licenseKey,
    };
  });
}

/**
 * Create or reuse a free-tier customer and license for a Better Auth user.
 *
 * @param request - Incoming POST with `X-Admin-Secret` and JSON body.
 * @param env - Worker bindings, including D1 and `ADMIN_API_SECRET`.
 * @returns The provision payload, or a tagged provision error.
 */
export function provisionUser(
  request: Request,
  env: Env
): Effect.Effect<ProvisionResponse, ProvisionError> {
  return Effect.gen(function* () {
    yield* requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET);
    const body = yield* decodeJsonBody(request, ProvisionRequestSchema);
    const existing = yield* findCustomerByEmail(env.DB, body.email);
    if (existing === null) {
      return yield* insertCustomerWithLicense(env.DB, body, request);
    }
    const license = yield* findActiveLicense(env.DB, existing.id);
    if (license !== null) {
      return {
        success: true as const,
        customerId: existing.id,
        licenseKey: license.license_key,
        message: 'Customer already exists',
      };
    }
    const licenseKey = yield* insertLicense(env.DB, existing.id);
    return {
      success: true as const,
      customerId: existing.id,
      licenseKey,
    };
  });
}

function httpStatusFor(error: ProvisionError): number {
  switch (error._tag) {
    case 'AdminUnauthorizedError':
      return 401;
    case 'InvalidJsonBodyError':
      return 400;
    case 'ProvisionStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

function responseFromExit(exit: Exit.Exit<ProvisionResponse, ProvisionError>): Response {
  return Exit.match(exit, {
    onSuccess: payload => jsonResponse(payload),
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
 * HTTP adapter for `POST /api/provision-user`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON provision payload or a mapped error response.
 */
export async function handleProvisionUser(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(provisionUser(request, env));
  return responseFromExit(exit);
}
