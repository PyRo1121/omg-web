import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type {
  LicensingSummary,
  LicensingSummaryState,
} from '../../../../site/shared/licensing-summary';

const INTERNAL_ORIGIN = 'https://omg-saas.internal';
const SESSION_BODY_LIMIT = 16 * 1024;
const DASHBOARD_BODY_LIMIT = 1024 * 1024;
const ROLE_QUERY = 'SELECT role FROM auth_user WHERE id = ?';
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const ShortText = NonEmptyString.check(Schema.isMaxLength(64));
const DimensionText = NonEmptyString.check(Schema.isMaxLength(256));
const NullableNonEmptyString = Schema.NullOr(NonEmptyString);
const NormalizedEmail = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(EMAIL_PATTERN)
);

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

const DashboardResponseSchema = Schema.Struct({
  license: Schema.Struct({
    tier: ShortText,
    status: ShortText,
    max_machines: Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1)),
    expires_at: NullableNonEmptyString,
  }),
  machines: Schema.Array(Schema.Unknown),
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

export class LicensingSummaryWorkerRejected extends Error {
  readonly _tag = 'LicensingSummaryWorkerRejected';
  constructor(
    readonly operation: 'session' | 'dashboard',
    readonly status: number
  ) {
    super(`Licensing Worker rejected ${operation}`);
  }
}

export class LicensingSummaryBodyTooLarge extends Error {
  readonly _tag = 'LicensingSummaryBodyTooLarge';
  constructor(readonly operation: 'session' | 'dashboard') {
    super(`Licensing ${operation} response is too large`);
  }
}

export class LicensingSummaryInvalidPayload extends Error {
  readonly _tag = 'LicensingSummaryInvalidPayload';
  constructor(
    readonly operation: 'session' | 'dashboard',
    override readonly cause?: unknown
  ) {
    super(`Licensing ${operation} response is invalid`);
  }
}

export type LicensingSummaryError =
  | LicensingSummaryInvalidInput
  | LicensingSummaryStoreUnavailable
  | LicensingSummaryServiceUnavailable
  | LicensingSummaryWorkerRejected
  | LicensingSummaryBodyTooLarge
  | LicensingSummaryInvalidPayload;

function parseInput<S extends Schema.Top>(
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
  operation: 'session' | 'dashboard',
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
      return JSON.parse(new TextDecoder().decode(bytes));
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
  operation: 'session' | 'dashboard'
): Effect.Effect<S['Type'], LicensingSummaryInvalidPayload, S['DecodingServices']> {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(cause => new LicensingSummaryInvalidPayload(operation, cause))
  );
}

export function loadLicensingSummary(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<LicensingSummary, LicensingSummaryError> {
  return Effect.gen(function* () {
    const parsedIdentity = yield* parseInput(
      IdentitySchema,
      identity,
      'Licensing identity is invalid'
    );
    const secret = yield* parseInput(
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

    const sessionResponse = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}/api/internal/site-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': secret,
          'X-Internal-Call': 'service-binding',
        },
        body: JSON.stringify({
          email: parsedIdentity.email,
          name: parsedIdentity.name,
          betterAuthUserId: parsedIdentity.id,
          role: role.role,
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

    const dashboardResponse = yield* serviceFetch(
      env.LICENSING_API,
      new Request(`${INTERNAL_ORIGIN}/api/dashboard`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.token}` },
      })
    );
    if (!dashboardResponse.ok) {
      return yield* Effect.fail(
        new LicensingSummaryWorkerRejected('dashboard', dashboardResponse.status)
      );
    }
    const dashboardJson = yield* readBoundedJson(
      dashboardResponse,
      'dashboard',
      DASHBOARD_BODY_LIMIT
    );
    const dashboard = yield* parseWorkerPayload(
      DashboardResponseSchema,
      dashboardJson,
      'dashboard'
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
  return Exit.isSuccess(exit)
    ? { status: 'available', summary: exit.value }
    : { status: 'unavailable' };
}
