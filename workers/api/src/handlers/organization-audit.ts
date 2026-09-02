import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import type {
  OrganizationAuditFilter,
  OrganizationAuditResponse,
} from '../../../../shared/organization-audit';
import { AdminUnauthorizedError, requireInternalSecret } from '../admin-secret';
import { isTeamOrEnterpriseTier } from '../contracts/d1-extras';
import {
  type Env,
  enforceRateLimit,
  errorResponse,
  rateLimitClientIp,
  respondFromEffect,
} from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import {
  OrganizationAuditContextRowSchema,
  OrganizationAuditMetadataSchema,
  OrganizationAuditRequestSchema,
  OrganizationAuditResponseSchema,
  OrganizationAuditRowSchema,
} from '../contracts/organization-audit';
import { casesHandled } from '../prelude';

const PRIVATE_BODY_LIMIT = 8 * 1024;
const PAGE_SIZE = 25;
const ORGANIZATION_CONTEXT_QUERY = `SELECT
  organization.billing_customer_id AS billingCustomerId,
  organization.name,
  actor.role,
  license.tier,
  license.status AS licenseStatus,
  license.max_seats AS maxSeats,
  (SELECT COUNT(*) FROM auth_member AS seat WHERE seat.organization_id = organization.id) AS usedSeats
FROM auth_member AS actor
JOIN auth_user AS identity
  ON identity.id = actor.user_id
  AND identity.email_verified = 1
JOIN auth_organization AS organization
  ON organization.id = actor.organization_id
JOIN licenses AS license
  ON license.customer_id = organization.billing_customer_id
WHERE actor.user_id = ? AND organization.id = ?
LIMIT 2`;
const ORGANIZATION_AUDIT_BASE_QUERY = `SELECT
  action,
  metadata,
  created_at AS occurredAt
FROM audit_log
WHERE customer_id = ?
  AND resource_type = 'organization'
  AND action LIKE 'organization.%'`;

class OrganizationAuditNotFound extends Error {
  readonly _tag = 'OrganizationAuditNotFound';

  constructor() {
    super('Organization not found');
  }
}

class OrganizationAuditInvalidRow extends Error {
  readonly _tag = 'OrganizationAuditInvalidRow';

  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

class OrganizationAuditStoreUnavailable extends Error {
  readonly _tag = 'OrganizationAuditStoreUnavailable';

  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Organization audit unavailable during ${operation}`);
  }
}

type OrganizationAuditError =
  | AdminUnauthorizedError
  | InvalidJsonBodyError
  | OrganizationAuditInvalidRow
  | OrganizationAuditNotFound
  | OrganizationAuditStoreUnavailable;

type QueryParameter = string | number;

function queryAll(
  database: D1Database,
  sql: string,
  params: ReadonlyArray<QueryParameter>,
  operation: string
) {
  return Effect.tryPromise({
    try: () =>
      database
        .prepare(sql)
        .bind(...params)
        .all(),
    catch: cause => new OrganizationAuditStoreUnavailable(operation, cause),
  });
}

function decodeRows<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  reason: string,
  value: Schema.Schema.Encoded<Schema.Schema.Any>
): Effect.Effect<ReadonlyArray<Schema.Schema.Type<S>>, OrganizationAuditInvalidRow> {
  if (!Array.isArray(value)) {
    return Effect.fail(new OrganizationAuditInvalidRow(reason));
  }
  return Effect.forEach(value, row =>
    Schema.decodeUnknown(schema)(row).pipe(
      Effect.mapError(cause => new OrganizationAuditInvalidRow(reason, cause))
    )
  );
}

function auditFilterClause(filter: OrganizationAuditFilter): string {
  switch (filter) {
    case 'all':
      return '';
    case 'invitations':
      return ` AND action LIKE 'organization.invitation.%'`;
    case 'members':
      return ` AND action LIKE 'organization.member.%'`;
  }
}

function parseOccurredAt(value: string): Effect.Effect<string, OrganizationAuditInvalidRow> {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? Effect.fail(new OrganizationAuditInvalidRow('Organization audit timestamp is invalid'))
    : Effect.succeed(date.toISOString());
}

function parseAuditRole(
  metadata: string | null
): Effect.Effect<'owner' | 'admin' | 'member' | null, OrganizationAuditInvalidRow> {
  if (metadata === null) {
    return Effect.succeed(null);
  }
  return Schema.decodeUnknown(Schema.parseJson(OrganizationAuditMetadataSchema))(metadata).pipe(
    Effect.map(value => value.role),
    Effect.mapError(
      cause => new OrganizationAuditInvalidRow('Organization audit metadata is invalid', cause)
    )
  );
}

function loadOrganizationAudit(
  request: Request,
  env: Env
): Effect.Effect<OrganizationAuditResponse, OrganizationAuditError> {
  return Effect.gen(function* () {
    yield* requireInternalSecret(request.headers.get('X-Admin-Secret'), [env.SVELTE_BFF_SECRET]);
    const input = yield* decodeJsonBody(
      request,
      OrganizationAuditRequestSchema,
      PRIVATE_BODY_LIMIT
    );

    const contextResult = yield* queryAll(
      env.DB,
      ORGANIZATION_CONTEXT_QUERY,
      [input.userId, input.organizationId],
      'context'
    );
    const contexts = yield* decodeRows(
      OrganizationAuditContextRowSchema,
      'Organization audit context row is invalid',
      contextResult.results
    );
    if (contexts.length === 0) {
      return yield* Effect.fail(new OrganizationAuditNotFound());
    }
    if (contexts.length !== 1) {
      return yield* Effect.fail(new OrganizationAuditStoreUnavailable('contextCardinality'));
    }
    const context = contexts[0];
    if (context === undefined) {
      return yield* Effect.fail(new OrganizationAuditStoreUnavailable('contextCardinality'));
    }

    const offset = (input.page - 1) * PAGE_SIZE;
    const auditResult = yield* queryAll(
      env.DB,
      `${ORGANIZATION_AUDIT_BASE_QUERY}${auditFilterClause(input.filter)}
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?`,
      [context.billingCustomerId, PAGE_SIZE + 1, offset],
      'events'
    );
    const rows = yield* decodeRows(
      OrganizationAuditRowSchema,
      'Organization audit row is invalid',
      auditResult.results
    );
    const events = yield* Effect.forEach(rows.slice(0, PAGE_SIZE), row =>
      Effect.all({
        action: Effect.succeed(row.action),
        role: parseAuditRole(row.metadata),
        occurredAt: parseOccurredAt(row.occurredAt),
      })
    );

    const maxSeats =
      context.maxSeats !== null && Number.isInteger(context.maxSeats) && context.maxSeats >= 1
        ? context.maxSeats
        : null;
    const isPaidTier = isTeamOrEnterpriseTier(context.tier);
    const status =
      context.licenseStatus === 'active' &&
      isPaidTier &&
      maxSeats !== null &&
      Number.isInteger(context.usedSeats) &&
      context.usedSeats <= maxSeats
        ? 'active'
        : 'restricted';
    const payload = {
      organization: {
        name: context.name.trim(),
        role: context.role,
        status,
        tier: context.tier,
      },
      filter: input.filter,
      page: input.page,
      pageSize: PAGE_SIZE,
      hasMore: input.page < 40 && rows.length > PAGE_SIZE,
      events,
    };
    return yield* Schema.decodeUnknown(OrganizationAuditResponseSchema)(payload).pipe(
      Effect.mapError(
        cause => new OrganizationAuditInvalidRow('Organization audit response is invalid', cause)
      )
    );
  });
}

/** Return bounded organization history through the private service binding. */
export async function handleOrganizationAudit(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('X-Internal-Call') !== 'service-binding') {
    return errorResponse('Not found', 404);
  }
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `internal_organization_audit:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }

  return respondFromEffect(loadOrganizationAudit(request, env), auditError => {
    switch (auditError._tag) {
      case 'AdminUnauthorizedError':
        return errorResponse('Not found', 404);
      case 'InvalidJsonBodyError':
        return errorResponse('Organization audit request is invalid', 400);
      case 'OrganizationAuditNotFound':
        return errorResponse(auditError.message, 404);
      case 'OrganizationAuditInvalidRow':
      case 'OrganizationAuditStoreUnavailable':
        return errorResponse('Organization audit unavailable', 503);
      default:
        return casesHandled(auditError);
    }
  });
}
