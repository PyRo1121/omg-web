import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { ADMIN_CUSTOMER_STATUSES, ADMIN_CUSTOMER_TIERS } from '../../../../shared/admin-customers';
import { EMAIL_PATTERN } from '../../../../shared/email';
import type {
  AdminCustomerDetail,
  AdminCustomerDirectory,
  AdminCustomerLicenseUpdate,
} from '../../../../shared/admin-customers';
import {
  AdminOverviewForbidden,
  LicensingSummaryInvalidInput,
  LicensingSummaryInvalidPayload,
  LicensingSummaryStoreUnavailable,
  loadAdminServiceSession,
  loadPrivateWorkerPayload,
  parseLicensingInput,
  sendPrivateWorkerPayload,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingServiceSession,
  type LicensingSummaryIdentity,
} from './licensing-service.server';
import { normalizedOptionalText } from './optional-text.server';

const CUSTOMER_PAGE_LIMIT = 25;
const CUSTOMER_DIRECTORY_BODY_LIMIT = 512 * 1024;
const CUSTOMER_DETAIL_BODY_LIMIT = 512 * 1024;
const CUSTOMER_UPDATE_BODY_LIMIT = 16 * 1024;
const CUSTOMER_ID_BY_EMAIL_QUERY = 'SELECT id FROM customers WHERE email = ?';
const DirectoryQuerySchema = Schema.Struct({
  page: Schema.String.check(
    Schema.isPattern(/^\d+$/u),
    Schema.makeFilter(value => {
      const page = Number(value);
      return Number.isSafeInteger(page) && page >= 1 && page <= 10_000;
    })
  ),
  search: Schema.String.check(Schema.isMaxLength(100)),
});

const NonEmptyText = Schema.String.check(Schema.isMinLength(1));
const ShortText = NonEmptyText.check(Schema.isMaxLength(256));
const NullableText = Schema.NullOr(ShortText);
const NormalizedEmail = ShortText.check(
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(EMAIL_PATTERN)
);
const NonNegativeNumber = Schema.Number.check(
  Schema.makeFilter(value => Number.isFinite(value) && value >= 0)
);
const NullableNatural = Schema.NullOr(Schema.Natural);
const NullableNonNegativeNumber = Schema.NullOr(NonNegativeNumber);
const OptionalTimestamp = Schema.NullOr(
  ShortText.check(Schema.makeFilter(value => Number.isFinite(Date.parse(value))))
);
const DayText = ShortText.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)))
);

export function parseAdminCustomerDirectoryQuery(
  url: URL
): { readonly page: number; readonly search: string } | null {
  const decoded = Schema.decodeUnknownExit(DirectoryQuerySchema)({
    page: url.searchParams.get('page') ?? '1',
    search: url.searchParams.get('q') ?? '',
  });
  return Exit.isFailure(decoded)
    ? null
    : { page: Number(decoded.value.page), search: decoded.value.search.trim() };
}

const CustomerDirectoryResponseSchema = Schema.Struct({
  users: Schema.Array(
    Schema.Struct({
      id: NonEmptyText,
      email: NormalizedEmail,
      company: NullableText,
      created_at: OptionalTimestamp,
      tier: NullableText,
      license_status: NullableText,
      machine_count: NullableNatural,
      total_commands: NullableNatural,
      last_active_date: Schema.NullOr(DayText),
      active_days_30d: NullableNatural,
      engagement_score: NullableNonNegativeNumber,
      lifecycle_stage: NullableText,
    })
  ),
  pagination: Schema.Struct({
    page: Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1)),
    limit: Schema.Natural.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
    total: Schema.Natural,
    pages: Schema.Natural,
  }),
});

const CustomerDetailResponseSchema = Schema.Struct({
  user: Schema.Struct({
    id: NonEmptyText,
    email: NormalizedEmail,
    company: NullableText,
    stripe_customer_id: NullableText,
    telemetry_opt_out: Schema.optional(Schema.NullOr(Schema.Literals([0, 1]))),
    created_at: OptionalTimestamp,
    updated_at: OptionalTimestamp,
  }),
  license: Schema.Struct({
    id: NonEmptyText,
    customer_id: NonEmptyText,
    license_key: NonEmptyText,
    tier: ShortText,
    status: ShortText,
    max_seats: Schema.NullOr(Schema.Natural),
    max_machines: Schema.NullOr(Schema.Natural),
    expires_at: OptionalTimestamp,
  }),
  machines: Schema.Array(
    Schema.Struct({
      id: NonEmptyText,
      license_id: NonEmptyText,
      machine_id: NonEmptyText,
      hostname: NullableText,
      os: NullableText,
      arch: NullableText,
      omg_version: NullableText,
      user_name: NullableText,
      user_email: NullableText,
      is_active: Schema.optional(Schema.Literals([0, 1])),
      first_seen_at: OptionalTimestamp,
      last_seen_at: OptionalTimestamp,
    })
  ),
  usage: Schema.Array(
    Schema.Struct({
      date: DayText,
      license_id: Schema.NullOr(NonEmptyText),
      commands_run: NullableNatural,
      packages_installed: NullableNatural,
      packages_searched: NullableNatural,
      runtimes_switched: NullableNatural,
      sbom_generated: NullableNatural,
      vulnerabilities_found: NullableNatural,
      time_saved_ms: NullableNatural,
    })
  ),
});

const CustomerIdRowSchema = Schema.Struct({ id: NonEmptyText });
const CustomerUpdateResponseSchema = Schema.Struct({ success: Schema.Literal(true) });
const CustomerUpdateSchema = Schema.Struct({
  email: NormalizedEmail,
  tier: Schema.optional(Schema.Literals(ADMIN_CUSTOMER_TIERS)),
  status: Schema.optional(Schema.Literals(ADMIN_CUSTOMER_STATUSES)),
});

type AdminCustomerError = LicensingSummaryError | AdminOverviewForbidden;

export function resolveAdminCustomerId(
  email: string,
  env: LicensingSummaryEnvironment
): Effect.Effect<string, LicensingSummaryStoreUnavailable | LicensingSummaryInvalidPayload> {
  return Effect.gen(function* () {
    const value = yield* Effect.tryPromise({
      try: () => env.DB.prepare(CUSTOMER_ID_BY_EMAIL_QUERY).bind(email).first(),
      catch: cause => new LicensingSummaryStoreUnavailable(cause),
    });
    const row = yield* Schema.decodeUnknownEffect(CustomerIdRowSchema)(value).pipe(
      Effect.mapError(cause => new LicensingSummaryInvalidPayload('admin-customer-update', cause))
    );
    return row.id;
  });
}

/** Load a bounded, browser-safe customer directory page for a verified admin. */
export function loadAdminCustomers(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  page: number,
  search: string
): Effect.Effect<AdminCustomerDirectory, AdminCustomerError> {
  return Effect.gen(function* () {
    const safePage = yield* parseLicensingInput(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
      page,
      'Customer page is invalid'
    );
    const safeSearch = yield* parseLicensingInput(
      Schema.String.check(Schema.isMaxLength(100)),
      search,
      'Customer search is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const query = new URLSearchParams({
      page: String(safePage),
      limit: String(CUSTOMER_PAGE_LIMIT),
      ...(safeSearch.length > 0 && { search: safeSearch }),
    });
    const payload = yield* loadPrivateWorkerPayload(
      env,
      session,
      `/api/admin/users?${query.toString()}`,
      'admin-customers',
      CUSTOMER_DIRECTORY_BODY_LIMIT,
      CustomerDirectoryResponseSchema
    );
    return {
      customers: payload.users.map(customer => ({
        email: customer.email,
        company: normalizedOptionalText(customer.company),
        createdAt: customer.created_at,
        tier: normalizedOptionalText(customer.tier) ?? 'free',
        status: normalizedOptionalText(customer.license_status) ?? 'inactive',
        activeMachines: customer.machine_count ?? 0,
        totalCommands: customer.total_commands ?? 0,
        lastActiveDate: customer.last_active_date,
        activeDays30d: customer.active_days_30d ?? 0,
        engagementScore: customer.engagement_score ?? 0,
        lifecycleStage: normalizedOptionalText(customer.lifecycle_stage) ?? 'unknown',
      })),
      pagination: {
        page: payload.pagination.page,
        pageSize: payload.pagination.limit,
        total: payload.pagination.total,
        pages: payload.pagination.pages,
      },
    };
  });
}

/** Decode and project one customer detail using an already-authorized private session. */
export function loadAdminCustomerDetailById(
  env: LicensingSummaryEnvironment,
  session: LicensingServiceSession,
  customerId: string
): Effect.Effect<AdminCustomerDetail, LicensingSummaryError> {
  return Effect.gen(function* () {
    const query = new URLSearchParams({ id: customerId });
    const payload = yield* loadPrivateWorkerPayload(
      env,
      session,
      `/api/admin/user?${query.toString()}`,
      'admin-customer-detail',
      CUSTOMER_DETAIL_BODY_LIMIT,
      CustomerDetailResponseSchema
    );
    return {
      email: payload.user.email,
      company: normalizedOptionalText(payload.user.company),
      createdAt: payload.user.created_at,
      updatedAt: payload.user.updated_at,
      tier: payload.license.tier,
      status: payload.license.status,
      maxSeats: payload.license.max_seats,
      maxMachines: payload.license.max_machines,
      expiresAt: payload.license.expires_at,
      telemetryOptOut: payload.user.telemetry_opt_out === 1,
      billingLinked: payload.user.stripe_customer_id !== null,
      machines: payload.machines.map(machine => ({
        hostname: normalizedOptionalText(machine.hostname),
        operatingSystem: normalizedOptionalText(machine.os),
        architecture: normalizedOptionalText(machine.arch),
        omgVersion: normalizedOptionalText(machine.omg_version),
        active: machine.is_active === 1,
        firstSeenAt: machine.first_seen_at,
        lastSeenAt: machine.last_seen_at,
      })),
      usage: payload.usage.map(day => ({
        date: day.date,
        commands: day.commands_run ?? 0,
        packagesInstalled: day.packages_installed ?? 0,
        packagesSearched: day.packages_searched ?? 0,
        runtimesSwitched: day.runtimes_switched ?? 0,
        sbomsGenerated: day.sbom_generated ?? 0,
        vulnerabilitiesFound: day.vulnerabilities_found ?? 0,
        timeSavedMs: day.time_saved_ms ?? 0,
      })),
    };
  });
}

/** Load one browser-safe support view after resolving the customer server-side. */
export function loadAdminCustomerDetail(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  email: string
): Effect.Effect<AdminCustomerDetail, AdminCustomerError> {
  return Effect.gen(function* () {
    const safeEmail = yield* parseLicensingInput(
      NormalizedEmail,
      email,
      'Customer email is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(safeEmail, env);
    return yield* loadAdminCustomerDetailById(env, session, customerId);
  });
}

/** Apply an existing audited tier or status mutation without exposing customer IDs. */
export function updateAdminCustomerLicense(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: AdminCustomerLicenseUpdate
): Effect.Effect<void, AdminCustomerError> {
  return Effect.gen(function* () {
    const safeInput = yield* parseLicensingInput(
      CustomerUpdateSchema,
      input,
      'Customer update is invalid'
    );
    if (safeInput.tier === undefined && safeInput.status === undefined) {
      return yield* Effect.fail(new LicensingSummaryInvalidInput('Customer update is empty'));
    }
    const session = yield* loadAdminServiceSession(identity, env);
    const customerId = yield* resolveAdminCustomerId(safeInput.email, env);
    yield* sendPrivateWorkerPayload(
      env,
      session,
      '/api/admin/user',
      'admin-customer-update',
      CUSTOMER_UPDATE_BODY_LIMIT,
      CustomerUpdateResponseSchema,
      {
        userId: customerId,
        ...(safeInput.tier !== undefined && { tier: safeInput.tier }),
        ...(safeInput.status !== undefined && { status: safeInput.status }),
      }
    );
  });
}
