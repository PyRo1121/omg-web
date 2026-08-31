import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type {
  AdminOrganizationDirectory,
  AdminOrganizationSupport,
} from '../../../../shared/admin-organizations';
import {
  AdminOverviewForbidden,
  loadAdminServiceSession,
  loadPrivateWorkerPayload,
  parseLicensingInput,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';

const DIRECTORY_LIMIT = 256 * 1024;
const SUPPORT_LIMIT = 256 * 1024;
const QuerySchema = Schema.Struct({
  page: Schema.String.check(
    Schema.isPattern(/^\d{1,2}$/u),
    Schema.makeFilter(value => Number(value) >= 1 && Number(value) <= 40)
  ),
  search: Schema.String.check(Schema.isMaxLength(100)),
});
const OrganizationSlug = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(48),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
);
const SupportQuerySchema = Schema.Struct({ slug: OrganizationSlug });
const ShortText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const NormalizedEmail = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(320),
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u)
);
const Timestamp = Schema.String.check(
  Schema.isMinLength(20),
  Schema.isMaxLength(32),
  Schema.makeFilter(value => Number.isFinite(Date.parse(value)))
);
const Role = Schema.Literals(['owner', 'admin', 'member']);
const InvitationRole = Schema.Literals(['admin', 'member']);
const Tier = Schema.NullOr(Schema.Literals(['free', 'pro', 'team', 'enterprise']));
const AuditAction = Schema.Literals([
  'organization.invitation.accepted',
  'organization.invitation.created',
  'organization.invitation.delivery_failed',
  'organization.invitation.rejected',
  'organization.invitation.resent',
  'organization.invitation.revoked',
  'organization.member.ownership_transferred',
  'organization.member.removed',
  'organization.member.role_changed',
]);
const UsageTotalsSchema = Schema.Struct({
  commands: Schema.Natural,
  packagesInstalled: Schema.Natural,
  packagesSearched: Schema.Natural,
  runtimeSwitches: Schema.Natural,
  sbomsGenerated: Schema.Natural,
  vulnerabilitiesFound: Schema.Natural,
  timeSavedMs: Schema.Natural,
});
const DirectoryResponseSchema = Schema.Struct({
  organizations: Schema.Array(
    Schema.Struct({
      name: ShortText,
      slug: OrganizationSlug,
      tier: ShortText,
      status: ShortText,
      seatsUsed: Schema.Natural,
      seatLimit: Schema.NullOr(Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1))),
      pendingInvitations: Schema.Natural,
      activeMachines: Schema.Natural,
      lastAuditAt: Schema.NullOr(ShortText),
    })
  ).check(Schema.isMaxLength(25)),
  pagination: Schema.Struct({
    page: Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1)),
    pageSize: Schema.Literal(25),
    total: Schema.Natural,
    pages: Schema.Natural,
  }),
});
const SupportResponseSchema = Schema.Struct({
  organization: Schema.Struct({ name: ShortText, slug: OrganizationSlug }),
  entitlement: Schema.Struct({
    tier: Tier,
    licenseStatus: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
    access: Schema.Literals(['active', 'restricted']),
  }),
  seats: Schema.Struct({
    used: Schema.Natural,
    limit: Schema.NullOr(Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1))),
  }),
  members: Schema.Array(
    Schema.Struct({
      name: ShortText,
      email: NormalizedEmail,
      role: Role,
      joinedAt: Timestamp,
    })
  ).check(Schema.isMaxLength(100)),
  hasMoreMembers: Schema.Boolean,
  invitations: Schema.Array(
    Schema.Struct({
      email: NormalizedEmail,
      role: InvitationRole,
      status: Schema.Literals(['pending', 'expired']),
      expiresAt: Timestamp,
    })
  ).check(Schema.isMaxLength(100)),
  hasMoreInvitations: Schema.Boolean,
  usage: Schema.Struct({
    windowDays: Schema.Literal(30),
    activeDays: Schema.Natural,
    totals: UsageTotalsSchema,
  }),
  fleet: Schema.Struct({
    activeMachines: Schema.Natural,
    seenWithinSevenDays: Schema.Natural,
    notSeenWithinSevenDays: Schema.Natural,
    versions: Schema.Array(
      Schema.Struct({
        version: Schema.NullOr(ShortText),
        machines: Schema.Natural,
      })
    ).check(Schema.isMaxLength(50)),
    hasMoreVersions: Schema.Boolean,
  }),
  audit: Schema.Struct({
    events: Schema.Array(
      Schema.Struct({
        action: AuditAction,
        role: Schema.NullOr(Role),
        occurredAt: Timestamp,
      })
    ).check(Schema.isMaxLength(25)),
    hasMoreEvents: Schema.Boolean,
  }),
});

export function parseAdminOrganizationQuery(
  url: URL
): { readonly page: number; readonly search: string } | null {
  if (url.searchParams.getAll('page').length > 1 || url.searchParams.getAll('q').length > 1) {
    return null;
  }
  const decoded = Schema.decodeUnknownExit(QuerySchema)({
    page: url.searchParams.get('page') ?? '1',
    search: url.searchParams.get('q') ?? '',
  });
  return Exit.isFailure(decoded)
    ? null
    : { page: Number(decoded.value.page), search: decoded.value.search.trim() };
}

/** Parse one exact browser-safe organization support selection. */
export function parseAdminOrganizationSupportQuery(url: URL): string | null {
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => key !== 'slug') || url.searchParams.getAll('slug').length !== 1) {
    return null;
  }
  const decoded = Schema.decodeUnknownExit(SupportQuerySchema)({
    slug: url.searchParams.get('slug'),
  });
  return Exit.isFailure(decoded) ? null : decoded.value.slug;
}

/** Load the private browser-safe organization directory for an operator. */
export function loadAdminOrganizations(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  page: number,
  search: string
): Effect.Effect<AdminOrganizationDirectory, LicensingSummaryError | AdminOverviewForbidden> {
  return Effect.gen(function* () {
    const safePage = yield* parseLicensingInput(
      Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(40)
      ),
      page,
      'Organization page is invalid'
    );
    const safeSearch = yield* parseLicensingInput(
      Schema.String.check(Schema.isMaxLength(100)),
      search,
      'Organization search is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const query = new URLSearchParams({ page: String(safePage) });
    if (safeSearch.length > 0) {
      query.set('search', safeSearch);
    }
    return yield* loadPrivateWorkerPayload(
      env,
      session,
      `/api/admin/organizations?${query.toString()}`,
      'admin-organizations',
      DIRECTORY_LIMIT,
      DirectoryResponseSchema
    );
  });
}

/** Load one selected organization support projection through the private Worker session. */
export function loadAdminOrganizationSupport(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  slug: string
): Effect.Effect<AdminOrganizationSupport, LicensingSummaryError | AdminOverviewForbidden> {
  return Effect.gen(function* () {
    const safeSlug = yield* parseLicensingInput(
      OrganizationSlug,
      slug,
      'Organization support slug is invalid'
    );
    const session = yield* loadAdminServiceSession(identity, env);
    const query = new URLSearchParams({ slug: safeSlug });
    return yield* loadPrivateWorkerPayload(
      env,
      session,
      `/api/admin/organizations/support?${query.toString()}`,
      'admin-organization-support',
      SUPPORT_LIMIT,
      SupportResponseSchema
    );
  });
}
