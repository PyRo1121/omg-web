import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { Cause, Effect, Exit, Option } from 'effect';
import { loadAccountIdentity, type AccountDashboardIdentity } from './account-dashboard.server';
import { createShadowAuth, type AuthEnvironment } from './auth.server';
import {
  OrganizationInvitationFormInvalid,
  loadActiveOrganizationId,
  recordOrganizationAudit,
} from './organization-invitation.server';
import type { OrganizationActionEvent } from './organization-route-actions.server';
import {
  findOrganizationMemberTarget,
  parseRemovedMemberResult,
  parseUpdatedMemberResult,
  OrganizationMemberNotFound,
  OrganizationMemberProtected,
  OrganizationMemberResponseInvalid,
  OrganizationMemberStoreUnavailable,
  readOrganizationMemberEmailForm,
  readOrganizationMemberRoleForm,
  type OrganizationMemberAuthGateway,
} from './organization-member.server';
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

type OrganizationMemberMutation = 'allowed' | 'limited' | 'unavailable';

async function organizationMemberRateLimit(
  event: OrganizationActionEvent,
  key: string
): Promise<OrganizationMemberMutation> {
  if (event.platform === undefined) {
    return 'unavailable';
  }
  try {
    const result = await event.platform.env.AUTH_RATE_LIMITER.limit({
      key: `organization:${key}`,
    });
    return result.success ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}

function apiErrorCode(cause: unknown): string | null {
  if (!(cause instanceof APIError)) {
    return null;
  }
  return cause.body?.code ?? null;
}

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

async function readActionInput<T>(
  effect: Effect.Effect<T, OrganizationInvitationFormInvalid>
): Promise<T | OrganizationInvitationFormInvalid> {
  const result = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(result)) {
    return result.value;
  }
  const failure = Option.getOrNull(Cause.findErrorOption(result.cause));
  return failure instanceof OrganizationInvitationFormInvalid
    ? failure
    : new OrganizationInvitationFormInvalid(400);
}

async function loadMemberMutationState(
  identity: AccountDashboardIdentity,
  event: OrganizationActionEvent
): Promise<'allowed' | 'restricted' | 'missing' | 'unavailable'> {
  if (event.platform === undefined) {
    return 'unavailable';
  }
  const state = await loadOrganizationMembersState(
    { ...identity.user, sessionToken: identity.sessionToken },
    event.platform.env.DB
  );
  if (state.status === 'active') {
    return 'allowed';
  }
  if (state.status === 'restricted') {
    return 'restricted';
  }
  if (state.status === 'no-organization') {
    return 'missing';
  }
  return 'unavailable';
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
  const input = await readActionInput(readOrganizationMemberRoleForm(event.request));
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
  const input = await readActionInput(readOrganizationMemberEmailForm(event.request));
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
    'organization.member.removed',
    target.role
  );
  redirect(303, '/dashboard/organization/members/');
}
