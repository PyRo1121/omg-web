import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit';
import { loadAccountIdentity, type AccountDashboardIdentity } from './account-dashboard.server';
import { createShadowAuth, type AuthEnvironment } from './auth.server';
import {
  OrganizationInvitationFormInvalid,
  loadActiveOrganizationId,
  recordOrganizationAudit,
} from './organization-invitation.server';
import {
  apiErrorCode,
  organizationMutationRateLimit as organizationMemberRateLimit,
  readActionInput,
  requireActiveOrganizationForGrowth as loadMemberMutationState,
  type OrganizationActionEvent,
} from './organization-route-actions.server';
import {
  findOrganizationMemberTarget,
  hasRecentOrganizationAuthentication,
  parseRemovedMemberResult,
  parseUpdatedMemberResult,
  OrganizationMemberNotFound,
  OrganizationMemberProtected,
  OrganizationMemberRecentAuthRequired,
  OrganizationMemberResponseInvalid,
  OrganizationMemberStoreUnavailable,
  OrganizationMemberTransferConflict,
  readOrganizationOwnershipTransferForm,
  transferOrganizationOwnership,
  type OrganizationMemberAuthGateway,
} from './organization-member.server';
import {
  readOrganizationInvitationEmailForm,
  readOrganizationInvitationForm,
} from './organization-invitation.server';
import { loadOrganizationMembersState } from './organization-workspace.server';

type IdentityLoader = (event: OrganizationActionEvent) => Promise<AccountDashboardIdentity | null>;

type OrganizationMemberGatewayFactory = (
  event: OrganizationActionEvent
) => OrganizationMemberAuthGateway;

const organizationMemberGateway: OrganizationMemberGatewayFactory = event => {
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const auth = createShadowAuth(event.platform.env, event.url);
  return {
    removeMember: async input => parseRemovedMemberResult(await auth.api.removeMember(input)),
    updateMemberRole: async input =>
      parseUpdatedMemberResult(await auth.api.updateMemberRole(input)),
  };
};

const defaultIdentityLoader: IdentityLoader = event => loadAccountIdentity(event);

interface OrganizationMemberActionFailure {
  readonly kind: 'organization-member-error';
  readonly message: string;
}

type OrganizationMemberActionFailureResult = ActionFailure<OrganizationMemberActionFailure>;

function organizationMemberFailure(
  cause: unknown,
  operation: 'role' | 'remove'
): OrganizationMemberActionFailureResult {
  if (cause instanceof OrganizationInvitationFormInvalid) {
    return fail(cause.status, {
      kind: 'organization-member-error' as const,
      message:
        operation === 'role'
          ? 'Enter a valid employee email and role.'
          : 'Enter a valid employee email.',
    });
  }
  if (cause instanceof OrganizationMemberNotFound) {
    return fail(404, {
      kind: 'organization-member-error' as const,
      message: 'That organization member is no longer available.',
    });
  }
  if (cause instanceof OrganizationMemberProtected) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message:
        cause.reason === 'owner'
          ? 'The organization Owner cannot be changed here.'
          : 'Your own organization access cannot be changed here.',
    });
  }
  if (cause instanceof OrganizationMemberStoreUnavailable) {
    return fail(503, {
      kind: 'organization-member-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  if (cause instanceof OrganizationMemberResponseInvalid) {
    return fail(503, {
      kind: 'organization-member-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }

  const code = apiErrorCode(cause);
  if (
    code === 'YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER' ||
    code === 'YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER' ||
    code === 'YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION' ||
    code === 'MEMBER_NOT_FOUND' ||
    code === 'NO_ACTIVE_ORGANIZATION'
  ) {
    return fail(code === 'MEMBER_NOT_FOUND' ? 404 : 403, {
      kind: 'organization-member-error' as const,
      message: 'You do not have permission to change this organization member.',
    });
  }
  if (
    code === 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER' ||
    code === 'YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER'
  ) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'The organization must keep an Owner.',
    });
  }
  return fail(503, {
    kind: 'organization-member-error' as const,
    message: 'Organization membership is temporarily unavailable.',
  });
}

function organizationOwnershipFailure(cause: unknown): OrganizationMemberActionFailureResult {
  if (cause instanceof OrganizationInvitationFormInvalid) {
    return fail(cause.status, {
      kind: 'organization-member-error' as const,
      message: 'Enter the target employee email and type TRANSFER OWNERSHIP exactly.',
    });
  }
  if (cause instanceof OrganizationMemberRecentAuthRequired) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Sign in again before transferring organization ownership.',
    });
  }
  if (cause instanceof OrganizationMemberNotFound) {
    return fail(404, {
      kind: 'organization-member-error' as const,
      message: 'That organization member is no longer available.',
    });
  }
  if (cause instanceof OrganizationMemberProtected) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message:
        cause.reason === 'owner'
          ? 'The selected employee is already an Owner.'
          : 'Your own organization access cannot be changed here.',
    });
  }
  if (cause instanceof OrganizationMemberTransferConflict) {
    return fail(409, {
      kind: 'organization-member-error' as const,
      message: 'Ownership changed before the transfer completed. Review the roster and try again.',
    });
  }
  if (cause instanceof OrganizationMemberStoreUnavailable) {
    return fail(503, {
      kind: 'organization-member-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  return fail(503, {
    kind: 'organization-member-error' as const,
    message: 'Organization membership is temporarily unavailable.',
  });
}

async function prepareMemberMutation(
  event: OrganizationActionEvent,
  identityLoader: IdentityLoader,
  allowRestricted: boolean,
  operation: 'role' | 'remove'
): Promise<
  | {
      readonly identity: AccountDashboardIdentity;
      readonly organizationId: string;
      readonly database: AuthEnvironment['DB'];
    }
  | OrganizationMemberActionFailureResult
> {
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const identity = await identityLoader(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  if (!identity.user.emailVerified) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Verify your email before changing organization membership.',
    });
  }
  const state = await loadMemberMutationState(identity, event);
  if (state === 'restricted' && !allowRestricted) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Membership changes are paused while the subscription is resolved.',
    });
  }
  if (state === 'missing') {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Create an organization before changing members.',
    });
  }
  if (state === 'unavailable') {
    return fail(503, {
      kind: 'organization-member-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  let organizationId: string | null;
  try {
    organizationId = await loadActiveOrganizationId(
      { ...identity.user, sessionToken: identity.sessionToken },
      event.platform.env.DB
    );
  } catch (cause) {
    return organizationMemberFailure(cause, operation);
  }
  if (organizationId === null) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Create an organization before changing members.',
    });
  }
  const rateLimit = await organizationMemberRateLimit(
    event,
    `${organizationId}:${identity.user.id}`
  );
  if (rateLimit === 'limited') {
    return fail(429, {
      kind: 'organization-member-error' as const,
      message: 'Too many membership changes. Try again shortly.',
    });
  }
  if (rateLimit === 'unavailable') {
    return fail(503, {
      kind: 'organization-member-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  return { database: event.platform.env.DB, identity, organizationId };
}

/** Change one non-owner member between the fixed Admin and Member roles. */
export async function changeOrganizationMemberRoleAction(
  event: OrganizationActionEvent,
  gateway: OrganizationMemberAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const input = await readActionInput(readOrganizationInvitationForm(event.request));
  if (input instanceof OrganizationInvitationFormInvalid) {
    return organizationMemberFailure(input, 'role');
  }
  const prepared = await prepareMemberMutation(event, identityLoader, false, 'role');
  if ('status' in prepared) {
    return prepared;
  }
  const target = await findOrganizationMemberTarget(
    { ...prepared.identity.user, sessionToken: prepared.identity.sessionToken },
    input.email,
    prepared.database
  );
  if (target === null) {
    return organizationMemberFailure(new OrganizationMemberNotFound(), 'role');
  }
  if (target.role === 'owner') {
    return organizationMemberFailure(new OrganizationMemberProtected('owner'), 'role');
  }
  if (target.userId === prepared.identity.user.id) {
    return organizationMemberFailure(new OrganizationMemberProtected('self'), 'role');
  }
  try {
    const authGateway = gateway ?? organizationMemberGateway(event);
    await authGateway.updateMemberRole({
      headers: event.request.headers,
      body: { memberId: target.id, role: input.role },
    });
  } catch (cause) {
    return organizationMemberFailure(cause, 'role');
  }
  await recordOrganizationAudit(
    prepared.database,
    event.request,
    prepared.organizationId,
    'organization.member.role_changed',
    input.role
  );
  redirect(303, '/dashboard/organization/members/');
}

/** Remove one non-owner member while preserving immediate authorization checks. */
export async function removeOrganizationMemberAction(
  event: OrganizationActionEvent,
  gateway: OrganizationMemberAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const input = await readActionInput(readOrganizationInvitationEmailForm(event.request));
  if (input instanceof OrganizationInvitationFormInvalid) {
    return organizationMemberFailure(input, 'remove');
  }
  const prepared = await prepareMemberMutation(event, identityLoader, true, 'remove');
  if ('status' in prepared) {
    return prepared;
  }
  const target = await findOrganizationMemberTarget(
    { ...prepared.identity.user, sessionToken: prepared.identity.sessionToken },
    input.email,
    prepared.database
  );
  if (target === null) {
    return organizationMemberFailure(new OrganizationMemberNotFound(), 'remove');
  }
  if (target.role === 'owner') {
    return organizationMemberFailure(new OrganizationMemberProtected('owner'), 'remove');
  }
  if (target.userId === prepared.identity.user.id) {
    return organizationMemberFailure(new OrganizationMemberProtected('self'), 'remove');
  }
  try {
    const authGateway = gateway ?? organizationMemberGateway(event);
    await authGateway.removeMember({
      headers: event.request.headers,
      body: { memberIdOrEmail: input.email },
    });
  } catch (cause) {
    return organizationMemberFailure(cause, 'remove');
  }
  await recordOrganizationAudit(
    prepared.database,
    event.request,
    prepared.organizationId,
    'organization.member.removed',
    target.role
  );
  redirect(303, '/dashboard/organization/members/');
}

/** Transfer ownership after a fresh session, exact target, and second confirmation. */
export async function transferOrganizationOwnershipAction(
  event: OrganizationActionEvent,
  identityLoader: IdentityLoader = defaultIdentityLoader,
  now: Date = new Date()
) {
  const input = await readActionInput(readOrganizationOwnershipTransferForm(event.request));
  if (input instanceof OrganizationInvitationFormInvalid) {
    return organizationOwnershipFailure(input);
  }
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const identity = await identityLoader(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  if (!identity.user.emailVerified) {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Verify your email before transferring organization ownership.',
    });
  }
  const workspaceIdentity = { ...identity.user, sessionToken: identity.sessionToken };
  const state = await loadOrganizationMembersState(workspaceIdentity, event.platform.env.DB, now);
  if (state.status === 'restricted') {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Ownership transfer is paused while the subscription is resolved.',
    });
  }
  if (state.status === 'no-organization') {
    return organizationOwnershipFailure(new OrganizationMemberNotFound());
  }
  if (state.status !== 'active') {
    return organizationOwnershipFailure(new OrganizationMemberStoreUnavailable());
  }
  if (state.organization.role !== 'owner') {
    return fail(403, {
      kind: 'organization-member-error' as const,
      message: 'Only the organization Owner can transfer ownership.',
    });
  }
  let organizationId: string | null;
  try {
    organizationId = await loadActiveOrganizationId(workspaceIdentity, event.platform.env.DB);
  } catch (cause) {
    return organizationOwnershipFailure(cause);
  }
  if (organizationId === null) {
    return organizationOwnershipFailure(new OrganizationMemberNotFound());
  }
  let isRecentAuthentication: boolean;
  try {
    isRecentAuthentication = await hasRecentOrganizationAuthentication(
      workspaceIdentity,
      event.platform.env.DB,
      now
    );
  } catch (cause) {
    return organizationOwnershipFailure(cause);
  }
  if (!isRecentAuthentication) {
    return organizationOwnershipFailure(new OrganizationMemberRecentAuthRequired());
  }
  const rateLimit = await organizationMemberRateLimit(
    event,
    `${organizationId}:${identity.user.id}:ownership`
  );
  if (rateLimit === 'limited') {
    return fail(429, {
      kind: 'organization-member-error' as const,
      message: 'Too many ownership changes. Try again shortly.',
    });
  }
  if (rateLimit === 'unavailable') {
    return organizationOwnershipFailure(new OrganizationMemberStoreUnavailable());
  }
  let target: Awaited<ReturnType<typeof findOrganizationMemberTarget>>;
  try {
    target = await findOrganizationMemberTarget(
      workspaceIdentity,
      input.email,
      event.platform.env.DB
    );
  } catch (cause) {
    return organizationOwnershipFailure(cause);
  }
  if (target === null) {
    return organizationOwnershipFailure(new OrganizationMemberNotFound());
  }
  if (target.role === 'owner') {
    return organizationOwnershipFailure(new OrganizationMemberProtected('owner'));
  }
  if (target.userId === identity.user.id) {
    return organizationOwnershipFailure(new OrganizationMemberProtected('self'));
  }
  try {
    await transferOrganizationOwnership(
      workspaceIdentity,
      organizationId,
      target,
      event.platform.env.DB,
      now
    );
  } catch (cause) {
    return organizationOwnershipFailure(cause);
  }
  await recordOrganizationAudit(
    event.platform.env.DB,
    event.request,
    organizationId,
    'organization.member.ownership_transferred'
  );
  redirect(303, '/dashboard/organization/members/');
}
