import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type { AdminOrganizationDirectory } from '../../../../site/shared/admin-organizations';
import {
  loadAdminServiceSession,
  loadPrivateWorkerPayload,
  parseLicensingInput,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
  type AdminOverviewForbidden,
} from './licensing-service.server';

const DIRECTORY_LIMIT = 256 * 1024;
const QuerySchema = Schema.Struct({
  page: Schema.String.check(
    Schema.isPattern(/^\d{1,2}$/u),
    Schema.makeFilter(value => Number(value) >= 1 && Number(value) <= 40)
  ),
  search: Schema.String.check(Schema.isMaxLength(100)),
});
const ShortText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const ResponseSchema = Schema.Struct({
  organizations: Schema.Array(
    Schema.Struct({
      name: ShortText,
      slug: ShortText,
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
      ResponseSchema
    );
  });
}
