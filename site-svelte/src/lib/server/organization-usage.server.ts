import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import type {
  OrganizationUsageRequest,
  OrganizationUsageResponse,
} from '../../../../site/shared/organization-usage';
import type { AuthEnvironment } from './auth.server';
import { type LicensingSummaryError, sendInternalWorkerPayload } from './licensing-service.server';
import {
  loadActiveOrganizationId,
  OrganizationInvitationStoreUnavailable,
} from './organization-invitation.server';
import { reportEffectFailure } from './observability.server';
import type { OrganizationWorkspaceIdentity } from './organization-workspace.server';

const ORGANIZATION_USAGE_RESPONSE_LIMIT = 256 * 1024;
const PrivateReference = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const DisplayText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const NormalizedEmail = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(320),
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u)
);
const Role = Schema.Literals(['owner', 'admin', 'member']);
const UsageTotalsSchema = Schema.Struct({
  commands: Schema.Natural,
  packagesInstalled: Schema.Natural,
  runtimeSwitches: Schema.Natural,
  timeSavedMs: Schema.Natural,
});
export const OrganizationUsageRequestSchema = Schema.Struct({
  organizationId: PrivateReference,
  userId: PrivateReference,
});
const OrganizationUsageResponseSchema = Schema.Struct({
  organization: Schema.Struct({
    name: DisplayText,
    role: Role,
    status: Schema.Literals(['active', 'restricted']),
    tier: Schema.NullOr(Schema.Literals(['free', 'pro', 'team', 'enterprise'])),
  }),
  seats: Schema.Struct({
    used: Schema.Natural,
    limit: Schema.NullOr(Schema.Natural.check(Schema.isGreaterThanOrEqualTo(1))),
  }),
  windowDays: Schema.Literal(30),
  members: Schema.Array(
    Schema.Struct({
      email: NormalizedEmail,
      name: DisplayText,
      role: Role,
      attributedMachines: Schema.Natural,
      usage: UsageTotalsSchema,
    })
  ),
  hasMoreMembers: Schema.Boolean,
  unattributed: Schema.Struct({
    machines: Schema.Natural,
    usage: UsageTotalsSchema,
  }),
  fleet: Schema.Struct({
    activeMachines: Schema.Natural,
    seenWithinSevenDays: Schema.Natural,
    notSeenWithinSevenDays: Schema.Natural,
    versions: Schema.Array(
      Schema.Struct({
        version: Schema.NullOr(DisplayText),
        machines: Schema.Natural,
      })
    ),
    hasMoreVersions: Schema.Boolean,
  }),
});

export type OrganizationUsageState =
  | { readonly status: 'available'; readonly usage: OrganizationUsageResponse }
  | { readonly status: 'verification-required' }
  | { readonly status: 'no-organization' }
  | { readonly status: 'unavailable' };

export class OrganizationUsageUnavailable extends Error {
  readonly _tag = 'OrganizationUsageUnavailable';

  constructor(override readonly cause?: unknown) {
    super('Organization usage is unavailable');
  }
}

/** Load a browser-safe usage projection for the actor's server-resolved active organization. */
export function loadOrganizationUsage(
  identity: OrganizationWorkspaceIdentity,
  env: Pick<AuthEnvironment, 'DB' | 'LICENSING_API' | 'SVELTE_BFF_SECRET'>
): Effect.Effect<
  OrganizationUsageResponse | null,
  LicensingSummaryError | OrganizationUsageUnavailable
> {
  return Effect.gen(function* () {
    const organizationId = yield* Effect.tryPromise({
      try: () => loadActiveOrganizationId(identity, env.DB),
      catch: cause =>
        new OrganizationUsageUnavailable(
          cause instanceof OrganizationInvitationStoreUnavailable ? cause : undefined
        ),
    });
    if (organizationId === null) {
      return null;
    }
    return yield* sendInternalWorkerPayload(
      env,
      '/api/internal/organization-usage',
      'organization-usage',
      ORGANIZATION_USAGE_RESPONSE_LIMIT,
      OrganizationUsageResponseSchema,
      { organizationId, userId: identity.id } satisfies OrganizationUsageRequest
    );
  });
}

/** Ground organization usage into explicit route states with localized degradation. */
export async function loadOrganizationUsageState(
  identity: OrganizationWorkspaceIdentity,
  env: Pick<AuthEnvironment, 'DB' | 'LICENSING_API' | 'SVELTE_BFF_SECRET'>
): Promise<OrganizationUsageState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  const exit = await Effect.runPromiseExit(loadOrganizationUsage(identity, env));
  if (Exit.isSuccess(exit)) {
    return exit.value === null
      ? { status: 'no-organization' }
      : { status: 'available', usage: exit.value };
  }
  reportEffectFailure('organization.usage_unavailable', exit.cause);
  return { status: 'unavailable' };
}
