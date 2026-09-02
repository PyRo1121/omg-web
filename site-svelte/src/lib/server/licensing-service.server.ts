import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { MachineText, NormalizedEmail } from './shared-schemas.server';
import type { AdminBreakdownItem, AdminOverview } from '../../../../shared/admin-overview';
import type { SiteSessionRole } from '../../../../shared/site-session';
import {
  MarketingOfferRequestSchema,
  MarketingOfferResponseSchema,
  type MarketingOffer,
} from '../contracts/marketing-offer';
import type { LicensingSummary, LicensingSummaryState } from '../../../../shared/licensing-summary';
import { reportEffectFailure } from './observability.server';
import { normalizedOptionalText } from './optional-text.server';

const INTERNAL_ORIGIN = 'https://omg-saas.internal';
const SESSION_BODY_LIMIT = 16 * 1024;
const DASHBOARD_BODY_LIMIT = 1024 * 1024;
const ADMIN_ACTIVITY_BODY_LIMIT = 128 * 1024;
const MARKETING_OFFER_BODY_LIMIT = 4 * 1024;
const ROLE_QUERY = 'SELECT role FROM auth_user WHERE id = ?';
const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const ShortText = NonEmptyString.check(Schema.isMaxLength(64));
const DimensionText = NonEmptyString.check(Schema.isMaxLength(256));
const TimestampText = ShortText.check(
  Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
);
const NullableNonEmptyString = Schema.NullOr(NonEmptyString);
const DayText = ShortText.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)))
);
const ClientAddress = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));

const IdentitySchema = Schema.Struct({
  id: NonEmptyString,
  email: NormalizedEmail,
  name: NonEmptyString,
  emailVerified: Schema.Literal(true),
});
const RoleRowSchema = Schema.Struct({ role: Schema.Literals(['user', 'admin']) });
const SessionResponseSchema = Schema.Struct({
  token: NonEmptyString,
  expiresAt: NonEmptyString,
  customerId: NonEmptyString,
});
type LicensingBoundaryInput = Schema.Top['Encoded'];

const AdminOverviewResponseSchema = Schema.Struct({
  overview: Schema.Struct({
    total_users: Schema.Natural,
    active_licenses: Schema.Natural,
    active_machines: Schema.Natural,
    total_installs: Schema.Natural,
    command_health: Schema.Struct({
      success: Schema.Natural,
      failure: Schema.Natural,
    }),
  }),
  fleet: Schema.Struct({
    versions: Schema.Array(
      Schema.Struct({ omg_version: Schema.NullOr(MachineText), count: Schema.Natural })
    ),
  }),
  tiers: Schema.Array(Schema.Struct({ tier: MachineText, count: Schema.Natural })),
  usage: Schema.Struct({
    total_commands: Schema.Natural,
    total_packages_installed: Schema.Natural,
    total_searches: Schema.Natural,
    total_time_saved_ms: Schema.Natural,
  }),
  daily_active_users: Schema.Array(
    Schema.Struct({ date: DayText, active_users: Schema.Natural, commands: Schema.Natural })
  ),
  recent_signups: Schema.Array(Schema.Struct({ date: DayText, count: Schema.Natural })),
  installs_by_platform: Schema.Array(
    Schema.Struct({ platform: Schema.NullOr(MachineText), count: Schema.Natural })
  ),
  subscriptions: Schema.Array(Schema.Struct({ status: MachineText, count: Schema.Natural })),
});

const AdminActivityResponseSchema = Schema.Struct({
  activity: Schema.Array(
    Schema.Struct({
      action: MachineText,
      resource_type: Schema.NullOr(MachineText),
      created_at: TimestampText,
    })
  ),
});

const DashboardResponseSchema = Schema.Struct({
  license: Schema.Struct({
    tier: ShortText,
    status: ShortText,
    max_machines: Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1)),
    expires_at: NullableNonEmptyString,
  }),
  machines: Schema.Array(
    Schema.Struct({
      hostname: Schema.NullOr(MachineText),
      os: Schema.NullOr(MachineText),
      arch: Schema.NullOr(MachineText),
      omg_version: Schema.NullOr(MachineText),
      last_seen_at: TimestampText,
      first_seen_at: TimestampText,
    })
  ),
  usage: Schema.Struct({
    total_commands: Schema.Natural,
    total_packages_installed: Schema.Natural,
    total_runtimes_switched: Schema.Natural,
    total_time_saved_ms: Schema.Natural,
    current_streak: Schema.Natural,
  }),
  global_stats: Schema.Struct({
    top_package: Schema.NullOr(DimensionText),
    top_runtime: Schema.NullOr(DimensionText),
  }),
  is_admin: Schema.Boolean,
  subscription: Schema.NullOr(
    Schema.Struct({
      status: ShortText,
      current_period_end: NullableNonEmptyString,
      cancel_at_period_end: Schema.Literals([0, 1]),
    })
  ),
});

export interface LicensingSummaryIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

interface LicensingRoleStatement {
  bind(...values: Array<unknown>): {
    first(columnName?: string): Promise<LicensingBoundaryInput>;
  };
}

interface LicensingSummaryDatabase {
  prepare(sql: string): LicensingRoleStatement;
}

interface LicensingSummaryService {
  fetch(request: Request): Promise<Response>;
}

export interface LicensingSummaryEnvironment {
  readonly DB: LicensingSummaryDatabase;
  readonly SVELTE_BFF_SECRET: string;
  readonly LICENSING_API: LicensingSummaryService;
}

export class LicensingSummaryInvalidInput extends Error {
  readonly _tag = 'LicensingSummaryInvalidInput';
  constructor(
    readonly reason: string,
    override readonly cause?: unknown
  ) {
    super(reason);
  }
}

export class LicensingSummaryStoreUnavailable extends Error {
  readonly _tag = 'LicensingSummaryStoreUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Licensing role lookup unavailable');
  }
}

export class LicensingSummaryServiceUnavailable extends Error {
  readonly _tag = 'LicensingSummaryServiceUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Licensing service unavailable');
  }
}

export type LicensingServiceOperation =
  | 'session'
  | 'dashboard'
  | 'admin-overview'
  | 'admin-activity'
  | 'admin-customers'
  | 'admin-organizations'
  | 'admin-organization-support'
  | 'admin-customer-detail'
  | 'admin-customer-update'
  | 'admin-customer-health'
  | 'admin-customer-notes'
  | 'admin-customer-tags'
  | 'admin-tag-catalog'
  | 'admin-analytics'
  | 'admin-cohorts'
  | 'admin-insights'
  | 'admin-revenue'
  | 'admin-audit'
  | 'admin-firehose'
  | 'admin-export-users'
  | 'admin-export-usage'
  | 'admin-export-audit'
  | 'site-analytics'
  | 'site-geo'
  | 'docs-analytics'
  | 'account-analytics'
  | 'account-achievements'
  | 'account-machines'
  | 'marketing-offer'
  | 'billing-checkout'
  | 'billing-fulfillment'
  | 'billing-portal'
  | 'organization-invitation-email'
  | 'organization-usage'
  | 'organization-audit';

export class LicensingSummaryWorkerRejected extends Error {
  readonly _tag = 'LicensingSummaryWorkerRejected';
  constructor(
    readonly operation: LicensingServiceOperation,
    readonly status: number
  ) {
    super(`Licensing Worker rejected ${operation}`);
  }
}

export class LicensingSummaryBodyTooLarge extends Error {
  readonly _tag = 'LicensingSummaryBodyTooLarge';
  constructor(readonly operation: LicensingServiceOperation) {
    super(`Licensing ${operation} response is too large`);
  }
}

export class LicensingSummaryInvalidPayload extends Error {
  readonly _tag = 'LicensingSummaryInvalidPayload';
  constructor(
    readonly operation: LicensingServiceOperation,
    override readonly cause?: unknown
  ) {
    super(`Licensing ${operation} response is invalid`);
  }
}

export class AdminOverviewForbidden extends Error {
  readonly _tag = 'AdminOverviewForbidden';
  constructor() {
    super('Admin access required');
  }
}

export type LicensingSummaryError =
  | LicensingSummaryInvalidInput
  | LicensingSummaryStoreUnavailable
  | LicensingSummaryServiceUnavailable
  | LicensingSummaryWorkerRejected
  | LicensingSummaryBodyTooLarge
  | LicensingSummaryInvalidPayload;

export function parseLicensingInput<S extends Schema.Top>(
  schema: S,
  value: LicensingBoundaryInput,
  reason: string
): Effect.Effect<S['Type'], LicensingSummaryInvalidInput, S['DecodingServices']> {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(cause => new LicensingSummaryInvalidInput(reason, cause))
  );
}

function serviceFetch(
  service: LicensingSummaryService,
  request: Request
): Effect.Effect<Response, LicensingSummaryServiceUnavailable> {
  return Effect.tryPromise({
    try: () => service.fetch(request),
    catch: cause => new LicensingSummaryServiceUnavailable(cause),
  });
}

function readBoundedJson(
  response: Response,
  operation: LicensingServiceOperation,
  limit: number
): Effect.Effect<
  LicensingBoundaryInput,
  LicensingSummaryBodyTooLarge | LicensingSummaryInvalidPayload
> {
  const declaredLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return Effect.fail(new LicensingSummaryBodyTooLarge(operation));
  }
  return Effect.tryPromise({
    try: async () => {
      const reader = response.body?.getReader();
      if (reader === undefined) {
        throw new LicensingSummaryInvalidPayload(operation);
      }
      const chunks: Array<Uint8Array> = [];
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        total += next.value.byteLength;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          throw new LicensingSummaryBodyTooLarge(operation);
        }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
    },
    catch: cause => {
      if (cause instanceof LicensingSummaryBodyTooLarge) {
        return cause;
      }
      return cause instanceof LicensingSummaryInvalidPayload
        ? cause
        : new LicensingSummaryInvalidPayload(operation, cause);
    },
  });
}

function parseWorkerPayload<S extends Schema.Top>(
  schema: S,
  value: LicensingBoundaryInput,
  operation: LicensingServiceOperation
): Effect.Effect<S['Type'], LicensingSummaryInvalidPayload, S['DecodingServices']> {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(cause => new LicensingSummaryInvalidPayload(operation, cause))
  );
}

interface LicensingServicePrincipal {
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly role: SiteSessionRole;
  readonly secret: string;
}

export interface LicensingServiceSession {
  readonly role: SiteSessionRole;
  readonly token: string;
}

/** Claim one bounded introductory offer through the private Worker binding. */
export function claimMarketingOffer(
  email: string,
  visitorIp: string,
  env: LicensingSummaryEnvironment
): Effect.Effect<MarketingOffer, LicensingSummaryError> {
  return Effect.gen(function* () {
    const request = yield* parseLicensingInput(
      MarketingOfferRequestSchema,
      { email: email.trim().toLowerCase() },
      'Marketing offer email is invalid'
    );
    const safeVisitorIp = yield* parseLicensingInput(
      ClientAddress,
      visitorIp,
      'Marketing offer client address is invalid'
    );
    const secret = yield* parseLicensingInput(
      NonEmptyString,
      env.SVELTE_BFF_SECRET,
      'Licensing BFF secret is invalid'
    );
    const response = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}/api/internal/marketing-offer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': secret,
          'X-Internal-Call': 'service-binding',
          'X-Offer-Visitor-IP': safeVisitorIp,
        },
        body: JSON.stringify(request),
      })
    );
    if (!response.ok) {
      return yield* Effect.fail(
        new LicensingSummaryWorkerRejected('marketing-offer', response.status)
      );
    }
    const json = yield* readBoundedJson(response, 'marketing-offer', MARKETING_OFFER_BODY_LIMIT);
    return yield* parseWorkerPayload(MarketingOfferResponseSchema, json, 'marketing-offer');
  });
}

function loadServicePrincipal(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<LicensingServicePrincipal, LicensingSummaryError> {
  return Effect.gen(function* () {
    const parsedIdentity = yield* parseLicensingInput(
      IdentitySchema,
      identity,
      'Licensing identity is invalid'
    );
    const secret = yield* parseLicensingInput(
      NonEmptyString,
      env.SVELTE_BFF_SECRET,
      'Licensing BFF secret is invalid'
    );
    const roleValue = yield* Effect.tryPromise({
      try: () => env.DB.prepare(ROLE_QUERY).bind(parsedIdentity.id).first(),
      catch: cause => new LicensingSummaryStoreUnavailable(cause),
    });
    const role = yield* parseWorkerPayload(RoleRowSchema, roleValue, 'session').pipe(
      Effect.mapError(cause => new LicensingSummaryInvalidInput('Licensing role is invalid', cause))
    );
    return {
      email: parsedIdentity.email,
      id: parsedIdentity.id,
      name: parsedIdentity.name,
      role: role.role,
      secret,
    };
  });
}

function mintServiceSession(
  principal: LicensingServicePrincipal,
  env: LicensingSummaryEnvironment
): Effect.Effect<LicensingServiceSession, LicensingSummaryError> {
  return Effect.gen(function* () {
    const sessionResponse = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}/api/internal/site-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': principal.secret,
          'X-Internal-Call': 'service-binding',
        },
        body: JSON.stringify({
          email: principal.email,
          name: principal.name,
          betterAuthUserId: principal.id,
          role: principal.role,
        }),
      })
    );
    if (!sessionResponse.ok) {
      return yield* Effect.fail(
        new LicensingSummaryWorkerRejected('session', sessionResponse.status)
      );
    }
    const sessionJson = yield* readBoundedJson(sessionResponse, 'session', SESSION_BODY_LIMIT);
    const session = yield* parseWorkerPayload(SessionResponseSchema, sessionJson, 'session');
    return { role: principal.role, token: session.token };
  });
}

export function loadUserServiceSession(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<LicensingServiceSession, LicensingSummaryError> {
  return loadServicePrincipal(identity, env).pipe(
    Effect.flatMap(principal => mintServiceSession(principal, env))
  );
}

type PrivateWorkerRequest =
  | { readonly method: 'GET' | 'DELETE' }
  | { readonly method: 'POST' | 'PUT'; readonly body: LicensingBoundaryInput };

/** Execute one authenticated private request without decoding a streaming response. */
export function requestPrivateWorkerResponse(
  env: LicensingSummaryEnvironment,
  session: LicensingServiceSession,
  path: `/${string}`,
  operation: LicensingServiceOperation
): Effect.Effect<Response, LicensingSummaryServiceUnavailable | LicensingSummaryWorkerRejected> {
  return Effect.gen(function* () {
    const response = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.token}` },
      })
    );
    if (!response.ok) {
      return yield* Effect.fail(new LicensingSummaryWorkerRejected(operation, response.status));
    }
    return response;
  });
}

/** Execute one authenticated Worker request and decode its bounded JSON response. */
export function requestPrivateWorkerPayload<S extends Schema.Top>(
  env: LicensingSummaryEnvironment,
  session: LicensingServiceSession,
  path: `/${string}`,
  operation: LicensingServiceOperation,
  limit: number,
  schema: S,
  request: PrivateWorkerRequest
): Effect.Effect<
  S['Type'],
  | LicensingSummaryServiceUnavailable
  | LicensingSummaryWorkerRejected
  | LicensingSummaryBodyTooLarge
  | LicensingSummaryInvalidPayload,
  S['DecodingServices']
> {
  return Effect.gen(function* () {
    const response = yield* serviceFetch(
      env.LICENSING_API,
      new Request(
        `${INTERNAL_ORIGIN}${path}`,
        !('body' in request)
          ? {
              method: request.method,
              headers: { Authorization: `Bearer ${session.token}` },
            }
          : {
              method: request.method,
              headers: {
                Authorization: `Bearer ${session.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(request.body),
            }
      )
    );
    if (!response.ok) {
      return yield* Effect.fail(new LicensingSummaryWorkerRejected(operation, response.status));
    }
    const json = yield* readBoundedJson(response, operation, limit);
    return yield* parseWorkerPayload(schema, json, operation);
  });
}

export function loadPrivateWorkerPayload<S extends Schema.Top>(
  env: LicensingSummaryEnvironment,
  session: LicensingServiceSession,
  path: `/${string}`,
  operation: LicensingServiceOperation,
  limit: number,
  schema: S
): Effect.Effect<
  S['Type'],
  | LicensingSummaryServiceUnavailable
  | LicensingSummaryWorkerRejected
  | LicensingSummaryBodyTooLarge
  | LicensingSummaryInvalidPayload,
  S['DecodingServices']
> {
  return requestPrivateWorkerPayload(env, session, path, operation, limit, schema, {
    method: 'GET',
  });
}

/** Send a bounded JSON request through an authenticated private Worker session. */
export function sendPrivateWorkerPayload<S extends Schema.Top>(
  env: LicensingSummaryEnvironment,
  session: LicensingServiceSession,
  path: `/${string}`,
  operation: LicensingServiceOperation,
  limit: number,
  schema: S,
  body: LicensingBoundaryInput
): Effect.Effect<
  S['Type'],
  | LicensingSummaryServiceUnavailable
  | LicensingSummaryWorkerRejected
  | LicensingSummaryBodyTooLarge
  | LicensingSummaryInvalidPayload,
  S['DecodingServices']
> {
  return requestPrivateWorkerPayload(env, session, path, operation, limit, schema, {
    method: 'POST',
    body,
  });
}

/** Load one bounded internal payload authenticated only for the Svelte Service Binding. */
export function loadInternalWorkerPayload<S extends Schema.Top>(
  env: LicensingSummaryEnvironment,
  path: `/${string}`,
  operation: LicensingServiceOperation,
  limit: number,
  schema: S
): Effect.Effect<S['Type'], LicensingSummaryError, S['DecodingServices']> {
  return Effect.gen(function* () {
    const secret = yield* parseLicensingInput(
      NonEmptyString,
      env.SVELTE_BFF_SECRET,
      'Licensing BFF secret is invalid'
    );
    const response = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}${path}`, {
        method: 'GET',
        headers: {
          'X-Admin-Secret': secret,
          'X-Internal-Call': 'service-binding',
        },
      })
    );
    if (!response.ok) {
      return yield* Effect.fail(new LicensingSummaryWorkerRejected(operation, response.status));
    }
    const json = yield* readBoundedJson(response, operation, limit);
    return yield* parseWorkerPayload(schema, json, operation);
  });
}

/** Send one bounded private payload through the Svelte-to-Worker service binding. */
export function sendInternalWorkerPayload<S extends Schema.Top>(
  env: LicensingSummaryEnvironment,
  path: `/${string}`,
  operation: LicensingServiceOperation,
  limit: number,
  schema: S,
  body: LicensingBoundaryInput
): Effect.Effect<
  S['Type'],
  | LicensingSummaryInvalidInput
  | LicensingSummaryServiceUnavailable
  | LicensingSummaryWorkerRejected
  | LicensingSummaryBodyTooLarge
  | LicensingSummaryInvalidPayload,
  S['DecodingServices']
> {
  return Effect.gen(function* () {
    const secret = yield* parseLicensingInput(
      NonEmptyString,
      env.SVELTE_BFF_SECRET,
      'Licensing BFF secret is invalid'
    );
    const response = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': secret,
          'X-Internal-Call': 'service-binding',
        },
        body: JSON.stringify(body),
      })
    );
    if (!response.ok) {
      return yield* Effect.fail(new LicensingSummaryWorkerRejected(operation, response.status));
    }
    const json = yield* readBoundedJson(response, operation, limit);
    return yield* parseWorkerPayload(schema, json, operation);
  });
}

/** Re-read the Better Auth role from D1 without minting a Worker session. */
export function requireAdminServiceAccess(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<void, LicensingSummaryError | AdminOverviewForbidden> {
  return loadServicePrincipal(identity, env).pipe(
    Effect.flatMap(principal =>
      principal.role === 'admin' ? Effect.void : Effect.fail(new AdminOverviewForbidden())
    )
  );
}

export function loadAdminServiceSession(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<LicensingServiceSession, LicensingSummaryError | AdminOverviewForbidden> {
  return Effect.gen(function* () {
    const principal = yield* loadServicePrincipal(identity, env);
    if (principal.role !== 'admin') {
      return yield* Effect.fail(new AdminOverviewForbidden());
    }
    return yield* mintServiceSession(principal, env);
  });
}

type NullableAdminBreakdownItem = Omit<AdminBreakdownItem, 'label'> & {
  readonly label: string | null;
};

function compactBreakdown(
  rows: ReadonlyArray<NullableAdminBreakdownItem>
): Array<AdminBreakdownItem> {
  const result: Array<AdminBreakdownItem> = [];
  for (const row of rows) {
    const label = normalizedOptionalText(row.label);
    if (label !== null) {
      result.push({ label, count: row.count });
    }
  }
  return result;
}

/** Load the private, browser-safe operator overview for one verified admin. */
export function loadAdminOverview(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<AdminOverview, LicensingSummaryError | AdminOverviewForbidden> {
  return Effect.gen(function* () {
    const session = yield* loadAdminServiceSession(identity, env);
    const [overview, activity] = yield* Effect.all([
      loadPrivateWorkerPayload(
        env,
        session,
        '/api/admin/dashboard',
        'admin-overview',
        DASHBOARD_BODY_LIMIT,
        AdminOverviewResponseSchema
      ),
      loadPrivateWorkerPayload(
        env,
        session,
        '/api/admin/activity?page=1&limit=10',
        'admin-activity',
        ADMIN_ACTIVITY_BODY_LIMIT,
        AdminActivityResponseSchema
      ),
    ]);

    return {
      totalUsers: overview.overview.total_users,
      activeLicenses: overview.overview.active_licenses,
      activeMachines: overview.overview.active_machines,
      totalInstalls: overview.overview.total_installs,
      commands30d: overview.usage.total_commands,
      packagesInstalled30d: overview.usage.total_packages_installed,
      searches30d: overview.usage.total_searches,
      timeSavedMs30d: overview.usage.total_time_saved_ms,
      commandSuccess24h: overview.overview.command_health.success,
      commandFailure24h: overview.overview.command_health.failure,
      dailyActivity: overview.daily_active_users.map(day => ({
        date: day.date,
        activeUsers: day.active_users,
        commands: day.commands,
      })),
      recentSignups: overview.recent_signups,
      fleetVersions: compactBreakdown(
        overview.fleet.versions.map(item => ({ label: item.omg_version, count: item.count }))
      ),
      installsByPlatform: compactBreakdown(
        overview.installs_by_platform.map(item => ({ label: item.platform, count: item.count }))
      ),
      tiers: compactBreakdown(
        overview.tiers.map(item => ({ label: item.tier, count: item.count }))
      ),
      subscriptions: compactBreakdown(
        overview.subscriptions.map(item => ({ label: item.status, count: item.count }))
      ),
      activity: activity.activity.map(item => ({
        action: item.action,
        resourceType: normalizedOptionalText(item.resource_type),
        createdAt: item.created_at,
      })),
    };
  });
}

export function loadLicensingSummary(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<LicensingSummary, LicensingSummaryError> {
  return Effect.gen(function* () {
    const session = yield* loadUserServiceSession(identity, env);
    const dashboard = yield* loadPrivateWorkerPayload(
      env,
      session,
      '/api/dashboard',
      'dashboard',
      DASHBOARD_BODY_LIMIT,
      DashboardResponseSchema
    );
    const activeMachines = yield* parseWorkerPayload(
      Schema.Natural,
      dashboard.machines.length,
      'dashboard'
    );

    return {
      tier: dashboard.license.tier,
      status: dashboard.license.status,
      maxMachines: dashboard.license.max_machines,
      activeMachines,
      isAdmin: dashboard.is_admin,
      machines: dashboard.machines.map(machine => ({
        hostname: normalizedOptionalText(machine.hostname),
        operatingSystem: normalizedOptionalText(machine.os),
        architecture: normalizedOptionalText(machine.arch),
        version: normalizedOptionalText(machine.omg_version),
        lastSeenAt: machine.last_seen_at,
        firstSeenAt: machine.first_seen_at,
      })),
      expiresAt: dashboard.license.expires_at,
      subscription:
        dashboard.subscription === null
          ? null
          : {
              status: dashboard.subscription.status,
              periodEnd: dashboard.subscription.current_period_end,
              cancelAtPeriodEnd: dashboard.subscription.cancel_at_period_end === 1,
            },
      usage: {
        totalCommands: dashboard.usage.total_commands,
        packagesInstalled: dashboard.usage.total_packages_installed,
        runtimeSwitches: dashboard.usage.total_runtimes_switched,
        timeSavedMs: dashboard.usage.total_time_saved_ms,
        currentStreak: dashboard.usage.current_streak,
        topPackage: dashboard.global_stats.top_package,
        topRuntime: dashboard.global_stats.top_runtime,
      },
    };
  });
}

/** Ground the typed licensing Effect into the serializable dashboard state. */
export async function loadLicensingSummaryState(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Promise<LicensingSummaryState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  const exit = await Effect.runPromiseExit(loadLicensingSummary(identity, env));
  if (Exit.isSuccess(exit)) {
    return { status: 'available', summary: exit.value };
  }
  reportEffectFailure('licensing.summary_unavailable', exit.cause);
  return { status: 'unavailable' };
}
