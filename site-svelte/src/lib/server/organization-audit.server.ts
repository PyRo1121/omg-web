import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type {
  OrganizationAuditFilter,
  OrganizationAuditRequest,
  OrganizationAuditResponse,
} from '../../../../shared/organization-audit';
import type { AuthEnvironment } from './auth.server';
import { type LicensingSummaryError, sendInternalWorkerPayload } from './licensing-service.server';
import {
  loadActiveOrganizationId,
  OrganizationInvitationStoreUnavailable,
} from './organization-invitation.server';
import { reportEffectFailure } from './observability.server';
import type { OrganizationWorkspaceIdentity } from './organization-workspace.server';

const ORGANIZATION_AUDIT_RESPONSE_LIMIT = 128 * 1024;
const PrivateReference = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const DisplayText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const Filter = Schema.Literals(['all', 'invitations', 'members']);
const Role = Schema.Literals(['owner', 'admin', 'member']);
const Action = Schema.Literals([
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
const Page = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(40)
);
const OccurredAt = Schema.String.check(
  Schema.isMinLength(20),
  Schema.isMaxLength(32),
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u)
);
export const OrganizationAuditRequestSchema = Schema.Struct({
  organizationId: PrivateReference,
  userId: PrivateReference,
  filter: Filter,
  page: Page,
});
const OrganizationAuditResponseSchema = Schema.Struct({
  organization: Schema.Struct({
    name: DisplayText,
    role: Role,
    status: Schema.Literals(['active', 'restricted']),
    tier: Schema.NullOr(Schema.Literals(['free', 'pro', 'team', 'enterprise'])),
  }),
  filter: Filter,
  page: Page,
  pageSize: Schema.Literal(25),
  hasMore: Schema.Boolean,
  events: Schema.Array(
    Schema.Struct({
      action: Action,
      role: Schema.NullOr(Role),
      occurredAt: OccurredAt,
    })
  ).check(Schema.isMaxLength(25)),
});

export interface OrganizationAuditQuery {
  readonly filter: OrganizationAuditFilter;
  readonly page: number;
}

export type OrganizationAuditState =
  | { readonly status: 'available'; readonly audit: OrganizationAuditResponse }
  | { readonly status: 'verification-required' }
  | { readonly status: 'no-organization' }
  | { readonly status: 'unavailable' };

export class OrganizationAuditQueryInvalid extends Error {
  readonly _tag = 'OrganizationAuditQueryInvalid';

  constructor() {
    super('Organization audit query is invalid');
  }
}

export class OrganizationAuditUnavailable extends Error {
  readonly _tag = 'OrganizationAuditUnavailable';

  constructor(override readonly cause?: unknown) {
    super('Organization audit is unavailable');
  }
}

/** Decode a bounded audit filter and page from browser query parameters. */
export function readOrganizationAuditQuery(searchParams: URLSearchParams): OrganizationAuditQuery {
  const filters = searchParams.getAll('filter');
  const pages = searchParams.getAll('page');
  if (filters.length > 1 || pages.length > 1) {
    throw new OrganizationAuditQueryInvalid();
  }
  const filterExit = Schema.decodeUnknownExit(Filter)(filters[0] ?? 'all');
  const rawPage = pages[0] ?? '1';
  if (!/^\d{1,2}$/u.test(rawPage)) {
    throw new OrganizationAuditQueryInvalid();
  }
  const pageExit = Schema.decodeUnknownExit(Page)(Number(rawPage));
  if (Exit.isFailure(filterExit) || Exit.isFailure(pageExit)) {
    throw new OrganizationAuditQueryInvalid();
  }
  return { filter: filterExit.value, page: pageExit.value };
}

/** Load browser-safe organization history for the server-resolved active organization. */
export function loadOrganizationAudit(
  identity: OrganizationWorkspaceIdentity,
  query: OrganizationAuditQuery,
  env: Pick<AuthEnvironment, 'DB' | 'LICENSING_API' | 'SVELTE_BFF_SECRET'>
): Effect.Effect<
  OrganizationAuditResponse | null,
  LicensingSummaryError | OrganizationAuditUnavailable
> {
  return Effect.gen(function* () {
    const organizationId = yield* Effect.tryPromise({
      try: () => loadActiveOrganizationId(identity, env.DB),
      catch: cause =>
        new OrganizationAuditUnavailable(
          cause instanceof OrganizationInvitationStoreUnavailable ? cause : undefined
        ),
    });
    if (organizationId === null) {
      return null;
    }
    return yield* sendInternalWorkerPayload(
      env,
      '/api/internal/organization-audit',
      'organization-audit',
      ORGANIZATION_AUDIT_RESPONSE_LIMIT,
      OrganizationAuditResponseSchema,
      {
        organizationId,
        userId: identity.id,
        filter: query.filter,
        page: query.page,
      } satisfies OrganizationAuditRequest
    );
  });
}

/** Ground organization history into explicit route states. */
export async function loadOrganizationAuditState(
  identity: OrganizationWorkspaceIdentity,
  query: OrganizationAuditQuery,
  env: Pick<AuthEnvironment, 'DB' | 'LICENSING_API' | 'SVELTE_BFF_SECRET'>
): Promise<OrganizationAuditState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  const exit = await Effect.runPromiseExit(loadOrganizationAudit(identity, query, env));
  if (Exit.isSuccess(exit)) {
    return exit.value === null
      ? { status: 'no-organization' }
      : { status: 'available', audit: exit.value };
  }
  reportEffectFailure('organization.audit_unavailable', exit.cause);
  return { status: 'unavailable' };
}
