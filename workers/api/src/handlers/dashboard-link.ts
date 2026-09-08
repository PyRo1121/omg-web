import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import {
  DashboardLinkResponseSchema,
  type DashboardLinkResponse,
} from '../../../../shared/dashboard-link';
import { type Env, errorResponse, respondFromEffect } from '../api';
import { requireSession, SessionUnauthorizedError } from '../admin-auth';

/** The CLI pastes only ASCII alphanumeric and "-", at most 128 characters. */
const LINK_KEY_BYTES = 32;
const PROVISIONED_TIER = 'free' as const;
const PROVISIONED_MAX_MACHINES = 5;

class DashboardLinkUnavailable extends Error {
  readonly _tag = 'DashboardLinkUnavailable';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Dashboard link unavailable during ${operation}`);
  }
}

interface LinkDatabase {
  prepare(sql: string): {
    bind(...params: unknown[]): { first<T>(): Promise<T | null> };
  };
}

function linkKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LINK_KEY_BYTES));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function queryFirst<T>(
  db: LinkDatabase,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
): Effect.Effect<T | null, DashboardLinkUnavailable> {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(sql)
        .bind(...params)
        .first<T>(),
    catch: cause => new DashboardLinkUnavailable(operation, cause),
  });
}

const LicenseRowSchema = Schema.Struct({
  license_key: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  tier: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  expires_at: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
});

/** Untrusted D1 row selected for link provisioning. */
interface LicenseRowInput {
  readonly license_key: unknown;
  readonly tier: unknown;
  readonly expires_at: unknown;
}

/**
 * Provision the customer's license if needed and return the CLI link
 * credential once. Provisioning is idempotent: one active license per
 * customer, and concurrent first-time requests converge because the insert is
 * ignored when the customer or key already exists, followed by a re-read.
 */
export function createDashboardLinkCredential(
  db: LinkDatabase,
  customerId: string
): Effect.Effect<DashboardLinkResponse, DashboardLinkUnavailable> {
  return Effect.gen(function* () {
    const existing = yield* queryFirst<{ id: string }>(
      db,
      'SELECT id FROM licenses WHERE customer_id = ?',
      [customerId],
      'findLicense'
    );
    if (existing === null) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              `INSERT OR IGNORE INTO licenses (id, customer_id, license_key, tier, status, max_machines)
               VALUES (?, ?, ?, ?, 'active', ?)`
            )
            .bind(
              crypto.randomUUID(),
              customerId,
              linkKey(),
              PROVISIONED_TIER,
              PROVISIONED_MAX_MACHINES
            )
            .first<unknown>(),
        catch: cause => new DashboardLinkUnavailable('provisionLicense', cause),
      });
    }

    const row = yield* queryFirst<LicenseRowInput>(
      db,
      'SELECT license_key, tier, expires_at FROM licenses WHERE customer_id = ?',
      [customerId],
      'readLicense'
    );
    if (row === null) {
      return yield* Effect.fail(new DashboardLinkUnavailable('readLicense', undefined));
    }
    const license = yield* Schema.decodeUnknown(LicenseRowSchema)(row).pipe(
      Effect.mapError(cause => new DashboardLinkUnavailable('readLicense', cause))
    );

    const machine = yield* queryFirst<{ count: number }>(
      db,
      'SELECT COUNT(*) AS count FROM machines WHERE license_id = (SELECT id FROM licenses WHERE customer_id = ?) AND is_active = 1',
      [customerId],
      'countMachines'
    );
    const machine_count = machine?.count ?? 0;

    return yield* Schema.decodeUnknown(DashboardLinkResponseSchema)({
      license_key: license.license_key,
      tier: license.tier,
      expires_at: license.expires_at,
      machine_count,
    }).pipe(Effect.mapError(cause => new DashboardLinkUnavailable('projectResponse', cause)));
  });
}

/**
 * HTTP adapter for `POST /api/dashboard/link`.
 *
 * @param request - Incoming POST with Bearer session.
 * @param env - Worker bindings.
 * @returns The customer's link credential, or a mapped error response.
 */
export function handleDashboardLink(request: Request, env: Env): Promise<Response> {
  return respondFromEffect(
    Effect.gen(function* () {
      const auth = yield* requireSession(request, env);
      return yield* createDashboardLinkCredential(env.DB, auth.user.id);
    }),
    error => {
      if (error instanceof SessionUnauthorizedError) {
        return errorResponse(error.message, 401);
      }
      return errorResponse('Internal server error', 503);
    }
  );
}
