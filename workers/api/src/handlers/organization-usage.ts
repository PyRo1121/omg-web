import { Effect } from 'effect';
import * as Schema from 'effect/Schema';
import type { OrganizationUsageResponse } from '../../../../shared/organization-usage';
import { AdminUnauthorizedError, requireInternalSecret } from '../admin-secret';
import {
  type Env,
  enforceRateLimit,
  errorResponse,
  rateLimitClientIp,
  respondFromEffect,
} from '../api';
import { decodeJsonBody, InvalidJsonBodyError } from '../body';
import { isTeamOrEnterpriseTier } from '../contracts/d1-extras';
import {
  decodeOrganizationUsageRow,
  decodeOrganizationUsageRows,
  OrganizationFleetRowSchema,
  OrganizationUnattributedRowSchema,
  OrganizationUsageContextRowSchema,
  OrganizationUsageRequestSchema,
  OrganizationUsageResponseSchema,
  OrganizationUsageMemberRowSchema,
  OrganizationUsageParseError,
  OrganizationVersionRowSchema,
} from '../contracts/organization-usage';
import { casesHandled } from '../prelude';

const PRIVATE_BODY_LIMIT = 8 * 1024;
const MAX_MEMBER_ROWS = 100;
const MAX_VERSION_ROWS = 50;
const ORGANIZATION_CONTEXT_QUERY = `SELECT
  organization.id AS organizationId,
  organization.name,
  actor.role,
  license.id AS licenseId,
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
const ORGANIZATION_MEMBER_USAGE_QUERY = `SELECT
  member_user.name,
  lower(member_user.email) AS email,
  member.role,
  COUNT(DISTINCT CASE WHEN machine.is_active = 1 THEN machine.machine_id END) AS attributedMachines,
  COALESCE(SUM(member_usage.commands_run), 0) AS commands,
  COALESCE(SUM(member_usage.packages_installed), 0) AS packagesInstalled,
  COALESCE(SUM(member_usage.runtimes_switched), 0) AS runtimeSwitches,
  COALESCE(SUM(member_usage.time_saved_ms), 0) AS timeSavedMs
FROM auth_member AS member
JOIN auth_user AS member_user ON member_user.id = member.user_id
LEFT JOIN machines AS machine
  ON machine.license_id = ?
  AND member_user.email_verified = 1
  AND lower(machine.user_email) = lower(member_user.email)
LEFT JOIN usage_member_daily AS member_usage
  ON member_usage.license_id = machine.license_id
  AND member_usage.machine_id = machine.machine_id
  AND member_usage.date >= date('now', '-29 days')
WHERE member.organization_id = ?
GROUP BY member.id, member_user.name, member_user.email, member.role, member.created_at
ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  member.created_at,
  member_user.email
LIMIT 101`;
const ORGANIZATION_UNATTRIBUTED_QUERY = `SELECT
  COUNT(DISTINCT CASE WHEN machine.id IS NOT NULL AND machine.is_active = 1 THEN machine.machine_id END) AS machines,
  COALESCE(SUM(member_usage.commands_run), 0) AS commands,
  COALESCE(SUM(member_usage.packages_installed), 0) AS packagesInstalled,
  COALESCE(SUM(member_usage.runtimes_switched), 0) AS runtimeSwitches,
  COALESCE(SUM(member_usage.time_saved_ms), 0) AS timeSavedMs
FROM usage_member_daily AS member_usage
LEFT JOIN machines AS machine
  ON machine.license_id = member_usage.license_id
  AND machine.machine_id = member_usage.machine_id
LEFT JOIN auth_user AS attributed_user
  ON attributed_user.email_verified = 1
  AND lower(attributed_user.email) = lower(machine.user_email)
LEFT JOIN auth_member AS attributed_member
  ON attributed_member.organization_id = ?
  AND attributed_member.user_id = attributed_user.id
WHERE member_usage.license_id = ?
  AND member_usage.date >= date('now', '-29 days')
  AND attributed_member.id IS NULL`;
const ORGANIZATION_FLEET_QUERY = `SELECT
  COUNT(*) AS activeMachines,
  COALESCE(SUM(CASE WHEN last_seen_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0)
    AS seenWithinSevenDays,
  COALESCE(SUM(CASE WHEN last_seen_at < datetime('now', '-7 days') THEN 1 ELSE 0 END), 0)
    AS notSeenWithinSevenDays
FROM machines
WHERE license_id = ? AND is_active = 1`;
const ORGANIZATION_VERSION_QUERY = `SELECT
  NULLIF(trim(omg_version), '') AS version,
  COUNT(*) AS machines
FROM machines
WHERE license_id = ? AND is_active = 1
GROUP BY NULLIF(trim(omg_version), '')
ORDER BY version IS NOT NULL, version
LIMIT 51`;

class OrganizationUsageNotFound extends Error {
  readonly _tag = 'OrganizationUsageNotFound';

  constructor() {
    super('Organization not found');
  }
}

class OrganizationUsageStoreUnavailable extends Error {
  readonly _tag = 'OrganizationUsageStoreUnavailable';

  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Organization usage unavailable during ${operation}`);
  }
}

type OrganizationUsageError =
  | AdminUnauthorizedError
  | InvalidJsonBodyError
  | OrganizationUsageNotFound
  | OrganizationUsageParseError
  | OrganizationUsageStoreUnavailable;

function queryAll(
  database: D1Database,
  sql: string,
  params: ReadonlyArray<string>,
  operation: string
) {
  return Effect.tryPromise({
    try: () =>
      database
        .prepare(sql)
        .bind(...params)
        .all(),
    catch: cause => new OrganizationUsageStoreUnavailable(operation, cause),
  });
}

function queryFirst(
  database: D1Database,
  sql: string,
  params: ReadonlyArray<string>,
  operation: string
) {
  return Effect.tryPromise({
    try: () =>
      database
        .prepare(sql)
        .bind(...params)
        .first(),
    catch: cause => new OrganizationUsageStoreUnavailable(operation, cause),
  });
}

function loadOrganizationUsage(
  request: Request,
  env: Env
): Effect.Effect<OrganizationUsageResponse, OrganizationUsageError> {
  return Effect.gen(function* () {
    yield* requireInternalSecret(request.headers.get('X-Admin-Secret'), [env.SVELTE_BFF_SECRET]);
    const input = yield* decodeJsonBody(
      request,
      OrganizationUsageRequestSchema,
      PRIVATE_BODY_LIMIT
    );

    const contextResult = yield* queryAll(
      env.DB,
      ORGANIZATION_CONTEXT_QUERY,
      [input.userId, input.organizationId],
      'context'
    );
    const contexts = yield* decodeOrganizationUsageRows(
      OrganizationUsageContextRowSchema,
      'Organization context row has an invalid shape',
      contextResult.results
    );
    if (contexts.length === 0) {
      return yield* Effect.fail(new OrganizationUsageNotFound());
    }
    if (contexts.length !== 1) {
      return yield* Effect.fail(new OrganizationUsageStoreUnavailable('contextCardinality'));
    }
    const context = contexts[0];
    if (context === undefined) {
      return yield* Effect.fail(new OrganizationUsageStoreUnavailable('contextCardinality'));
    }

    const [memberResult, unattributedValue, fleetValue, versionResult] = yield* Effect.all([
      queryAll(
        env.DB,
        ORGANIZATION_MEMBER_USAGE_QUERY,
        [context.licenseId, context.organizationId],
        'members'
      ),
      queryFirst(
        env.DB,
        ORGANIZATION_UNATTRIBUTED_QUERY,
        [context.organizationId, context.licenseId],
        'unattributed'
      ),
      queryFirst(env.DB, ORGANIZATION_FLEET_QUERY, [context.licenseId], 'fleet'),
      queryAll(env.DB, ORGANIZATION_VERSION_QUERY, [context.licenseId], 'versions'),
    ]);

    const memberRows = yield* decodeOrganizationUsageRows(
      OrganizationUsageMemberRowSchema,
      'Organization member usage rows have an invalid shape',
      memberResult.results
    );
    const unattributed = yield* decodeOrganizationUsageRow(
      OrganizationUnattributedRowSchema,
      'Organization unattributed usage row has an invalid shape',
      unattributedValue
    );
    const fleet = yield* decodeOrganizationUsageRow(
      OrganizationFleetRowSchema,
      'Organization fleet row has an invalid shape',
      fleetValue
    );
    const versionRows = yield* decodeOrganizationUsageRows(
      OrganizationVersionRowSchema,
      'Organization version rows have an invalid shape',
      versionResult.results
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
      seats: { used: context.usedSeats, limit: maxSeats },
      windowDays: 30 as const,
      members: memberRows.slice(0, MAX_MEMBER_ROWS).map(member => ({
        email: member.email.trim().toLowerCase(),
        name: member.name.trim() || member.email.trim().toLowerCase(),
        role: member.role,
        attributedMachines: member.attributedMachines,
        usage: {
          commands: member.commands,
          packagesInstalled: member.packagesInstalled,
          runtimeSwitches: member.runtimeSwitches,
          timeSavedMs: member.timeSavedMs,
        },
      })),
      hasMoreMembers: memberRows.length > MAX_MEMBER_ROWS,
      unattributed: {
        machines: unattributed.machines,
        usage: {
          commands: unattributed.commands,
          packagesInstalled: unattributed.packagesInstalled,
          runtimeSwitches: unattributed.runtimeSwitches,
          timeSavedMs: unattributed.timeSavedMs,
        },
      },
      fleet: {
        activeMachines: fleet.activeMachines,
        seenWithinSevenDays: fleet.seenWithinSevenDays,
        notSeenWithinSevenDays: fleet.notSeenWithinSevenDays,
        versions: versionRows.slice(0, MAX_VERSION_ROWS),
        hasMoreVersions: versionRows.length > MAX_VERSION_ROWS,
      },
    };
    return yield* Schema.decodeUnknown(OrganizationUsageResponseSchema)(payload).pipe(
      Effect.mapError(
        cause => new OrganizationUsageParseError('Organization usage response is invalid', cause)
      )
    );
  });
}

/** Return one bounded organization usage projection through the private service binding. */
export async function handleOrganizationUsage(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('X-Internal-Call') !== 'service-binding') {
    return errorResponse('Not found', 404);
  }
  const limited = await enforceRateLimit(
    env.API_RATE_LIMITER,
    `internal_organization_usage:${rateLimitClientIp(request)}`
  );
  if (limited !== null) {
    return limited;
  }

  return respondFromEffect(loadOrganizationUsage(request, env), error => {
    switch (error._tag) {
      case 'AdminUnauthorizedError':
        return errorResponse('Not found', 404);
      case 'InvalidJsonBodyError':
        return errorResponse('Organization usage request is invalid', 400);
      case 'OrganizationUsageNotFound':
        return errorResponse(error.message, 404);
      case 'OrganizationUsageParseError':
      case 'OrganizationUsageStoreUnavailable':
        return errorResponse('Organization usage unavailable', 503);
      default:
        return casesHandled(error);
    }
  });
}
