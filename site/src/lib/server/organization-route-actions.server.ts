import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { Cause, Effect, Exit, Option } from 'effect';
import { loadAccountIdentity, type AccountDashboardIdentity } from './account-dashboard.server';
import { createShadowAuth, type AuthEnvironment } from './auth.server';
import { OrganizationInvitationDeliveryFailed } from './organization-invitation-email.server';
import type { OrganizationWorkspaceIdentity } from './organization-workspace.server';
import {
  findPendingOrganizationInvitation,
  parseInvitationAcceptedResult,
  parseInvitationCanceledResult,
  parseInvitationCreatedResult,
  parseInvitationRejectedResult,
  loadActiveOrganizationId,
  loadInvitationOrganizationId,
  recordOrganizationAudit,
  OrganizationInvitationFormInvalid,
  OrganizationInvitationNotFound,
  OrganizationInvitationResponseInvalid,
  OrganizationInvitationStoreUnavailable,
  readOrganizationInvitationEmailForm,
  readOrganizationInvitationForm,
  type OrganizationInvitationAuthGateway,
} from './organization-invitation.server';
import {
  OrganizationBootstrapConflict,
  OrganizationBootstrapExisting,
  OrganizationBootstrapForbidden,
  OrganizationBootstrapInvalid,
  OrganizationBootstrapUnavailable,
  bootstrapOrganization,
  loadOrganizationMembersState,
  readOrganizationBootstrapForm,
} from './organization-workspace.server';
import {
  ORGANIZATION_INVITATION_ACCEPT_PATH,
  ORGANIZATION_INVITATION_REFERENCE_COOKIE,
  resolveOrganizationInvitationReference,
} from './organization-invitation-token.server';

interface OrganizationActionEnvironment extends AuthEnvironment {
  readonly AUTH_RATE_LIMITER: {
    readonly limit: (options: { readonly key: string }) => Promise<{ readonly success: boolean }>;
  };
}

interface OrganizationActionPlatform {
  readonly env: OrganizationActionEnvironment;
}

export interface OrganizationActionEvent {
  readonly platform: OrganizationActionPlatform | undefined;
  readonly request: Request;
  readonly url: URL;
}

interface OrganizationInvitationCookies {
  readonly delete: (name: string, options: { readonly path: string }) => void;
  readonly get: (name: string) => string | undefined;
}

export interface OrganizationInvitationAcceptanceEvent extends OrganizationActionEvent {
  readonly cookies: OrganizationInvitationCookies;
}

export type IdentityLoader = (
  event: OrganizationActionEvent
) => Promise<AccountDashboardIdentity | null>;

type OrganizationActionGatewayFactory = (
  event: OrganizationActionEvent
) => OrganizationInvitationAuthGateway;

const organizationInvitationGateway: OrganizationActionGatewayFactory = event => {
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const auth = createShadowAuth(event.platform.env, event.url);
  return {
    acceptInvitation: async input =>
      parseInvitationAcceptedResult(await auth.api.acceptInvitation(input)),
    cancelInvitation: async input =>
      parseInvitationCanceledResult(await auth.api.cancelInvitation(input)),
    rejectInvitation: async input =>
      parseInvitationRejectedResult(await auth.api.rejectInvitation(input)),
    createInvitation: async input =>
      parseInvitationCreatedResult(await auth.api.createInvitation(input)),
  };
};

const defaultIdentityLoader: IdentityLoader = event => loadAccountIdentity(event);

type OrganizationMutationOutcome = 'allowed' | 'limited' | 'unavailable';

export async function organizationMutationRateLimit(
  event: OrganizationActionEvent,
  key: string
): Promise<OrganizationMutationOutcome> {
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

export function apiErrorCode(cause: unknown): string | null {
  if (!(cause instanceof APIError)) {
    return null;
  }
  return cause.body?.code ?? null;
}

function organizationInvitationFailure(
  cause: unknown,
  operation: 'invite' | 'resend' | 'revoke' | 'accept' | 'reject'
) {
  if (cause instanceof OrganizationInvitationFormInvalid) {
    return fail(cause.status, {
      kind: 'organization-invitation-error' as const,
      message:
        operation === 'invite'
          ? 'Enter a valid employee email and role.'
          : 'Enter a valid employee email.',
    });
  }
  if (cause instanceof OrganizationInvitationNotFound) {
    const isRecipientOperation = operation === 'accept' || operation === 'reject';
    return fail(isRecipientOperation ? 400 : 404, {
      kind: 'organization-invitation-error' as const,
      message: isRecipientOperation
        ? 'This invitation is invalid or has expired.'
        : 'That pending invitation is no longer available.',
    });
  }
  if (cause instanceof OrganizationInvitationStoreUnavailable) {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  if (cause instanceof OrganizationInvitationResponseInvalid) {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  if (cause instanceof OrganizationInvitationDeliveryFailed) {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'The invitation was saved, but its email could not be sent. Retry it shortly.',
    });
  }

  const code = apiErrorCode(cause);
  if (
    code === 'YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION' ||
    code === 'YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE' ||
    code === 'YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION' ||
    code === 'MEMBER_NOT_FOUND' ||
    code === 'NO_ACTIVE_ORGANIZATION'
  ) {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message:
        operation === 'accept' || operation === 'reject'
          ? 'This invitation cannot be used by the current account.'
          : 'You do not have permission to change organization membership.',
    });
  }
  if (
    code === 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION' ||
    code === 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION'
  ) {
    return fail(409, {
      kind: 'organization-invitation-error' as const,
      message: 'That employee is already a member or has a pending invitation.',
    });
  }
  if (code === 'ORGANIZATION_MEMBERSHIP_LIMIT_REACHED' || code === 'INVITATION_LIMIT_REACHED') {
    return fail(409, {
      kind: 'organization-invitation-error' as const,
      message: 'The organization has reached its membership capacity.',
    });
  }
  if (
    code === 'INVITATION_NOT_FOUND' ||
    code === 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION' ||
    code === 'EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION'
  ) {
    const isRecipientOperation = operation === 'accept' || operation === 'reject';
    return fail(isRecipientOperation ? 400 : 404, {
      kind: 'organization-invitation-error' as const,
      message: isRecipientOperation
        ? 'This invitation is invalid or has expired.'
        : 'That pending invitation is no longer available.',
    });
  }
  return fail(503, {
    kind: 'organization-invitation-error' as const,
    message: 'Organization membership is temporarily unavailable.',
  });
}

export async function requireActiveOrganizationForGrowth(
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

export async function readActionInput<T>(
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

/** Create a new employee invitation through Better Auth's server API. */
export async function inviteOrganizationMemberAction(
  event: OrganizationActionEvent,
  gateway: OrganizationInvitationAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const input = await readActionInput(readOrganizationInvitationForm(event.request));
  if (input instanceof OrganizationInvitationFormInvalid) {
    return organizationInvitationFailure(input, 'invite');
  }
  const guard = await requireVerifiedOrganizationIdentity(
    event,
    identityLoader,
    'organization-invitation-error'
  );
  if (!('identity' in guard)) {
    return guard;
  }
  const { identity, serverIdentity, env } = guard;
  const activeState = await requireActiveOrganizationForGrowth(identity, event);
  if (activeState === 'restricted') {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message: 'Membership changes are paused while the subscription is resolved.',
    });
  }
  if (activeState === 'missing') {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message: 'Create an organization before inviting employees.',
    });
  }
  if (activeState === 'unavailable') {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  let organizationId: string | null;
  try {
    organizationId = await loadActiveOrganizationId(serverIdentity, env.DB);
  } catch (cause) {
    return organizationInvitationFailure(cause, 'invite');
  }
  if (organizationId === null) {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message: 'Create an organization before inviting employees.',
    });
  }
  const limited = await guardOrganizationMutationRate(
    event,
    organizationId,
    identity.user.id,
    'organization-invitation-error'
  );
  if (limited !== undefined) {
    return limited;
  }
  try {
    const authGateway = gateway ?? organizationInvitationGateway(event);
    await authGateway.createInvitation({
      headers: event.request.headers,
      body: { email: input.email, role: input.role },
    });
  } catch (cause) {
    if (cause instanceof OrganizationInvitationDeliveryFailed) {
      await recordOrganizationAudit(
        env.DB,
        event.request,
        organizationId,
        'organization.invitation.delivery_failed',
        input.role
      );
    }
    return organizationInvitationFailure(cause, 'invite');
  }
  await recordOrganizationAudit(
    env.DB,
    event.request,
    organizationId,
    'organization.invitation.created',
    input.role
  );
  redirect(303, '/dashboard/organization/members/');
}

/** Shared preamble for organization membership mutations. */
type OrganizationActionFailureKind = 'organization-invitation-error' | 'organization-member-error';

interface OrganizationMutationIdentity {
  readonly identity: AccountDashboardIdentity;
  readonly serverIdentity: OrganizationWorkspaceIdentity;
  readonly env: AuthEnvironment;
}

/** Reject unverified or absent identities before any organization mutation. */
export async function requireVerifiedOrganizationIdentity<K extends OrganizationActionFailureKind>(
  event: OrganizationActionEvent,
  identityLoader: IdentityLoader,
  failureKind: K
): Promise<
  OrganizationMutationIdentity | ActionFailure<{ readonly kind: K; readonly message: string }>
> {
  const platform = event.platform;
  if (platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const identity = await identityLoader(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  if (!identity.user.emailVerified) {
    return fail(403, {
      kind: failureKind,
      message: 'Verify your email before changing organization membership.',
    });
  }
  return {
    identity,
    serverIdentity: { ...identity.user, sessionToken: identity.sessionToken },
    env: platform.env,
  };
}

/** Reject membership mutations above the per-organization rate limit. */
export async function guardOrganizationMutationRate<K extends OrganizationActionFailureKind>(
  event: OrganizationActionEvent,
  organizationId: string,
  userId: string,
  failureKind: K
): Promise<ActionFailure<{ readonly kind: K; readonly message: string }> | undefined> {
  const rateLimit = await organizationMutationRateLimit(event, `${organizationId}:${userId}`);
  if (rateLimit === 'limited') {
    return fail(429, {
      kind: failureKind,
      message: 'Too many membership changes. Try again shortly.',
    });
  }
  if (rateLimit === 'unavailable') {
    return fail(503, {
      kind: failureKind,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  return undefined;
}

/** Resend the pending invitation for one normalized employee email. */
export async function resendOrganizationInvitationAction(
  event: OrganizationActionEvent,
  gateway: OrganizationInvitationAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const input = await readActionInput(readOrganizationInvitationEmailForm(event.request));
  if (input instanceof OrganizationInvitationFormInvalid) {
    return organizationInvitationFailure(input, 'resend');
  }
  const guard = await requireVerifiedOrganizationIdentity(
    event,
    identityLoader,
    'organization-invitation-error'
  );
  if (!('identity' in guard)) {
    return guard;
  }
  const { identity, serverIdentity, env } = guard;
  const activeState = await requireActiveOrganizationForGrowth(identity, event);
  if (activeState === 'restricted') {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message: 'Membership changes are paused while the subscription is resolved.',
    });
  }
  if (activeState !== 'allowed') {
    return fail(activeState === 'unavailable' ? 503 : 404, {
      kind: 'organization-invitation-error' as const,
      message:
        activeState === 'unavailable'
          ? 'Organization membership is temporarily unavailable.'
          : 'That pending invitation is no longer available.',
    });
  }
  let pending: Awaited<ReturnType<typeof findPendingOrganizationInvitation>>;
  try {
    pending = await findPendingOrganizationInvitation(serverIdentity, input.email, env.DB);
  } catch (cause) {
    return organizationInvitationFailure(cause, 'resend');
  }
  if (pending === null) {
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'resend');
  }
  let organizationId: string | null;
  try {
    organizationId = await loadActiveOrganizationId(serverIdentity, env.DB);
  } catch (cause) {
    return organizationInvitationFailure(cause, 'resend');
  }
  if (organizationId === null) {
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'resend');
  }
  const rateLimit = await organizationMutationRateLimit(
    event,
    `${organizationId}:${identity.user.id}`
  );
  if (rateLimit === 'limited') {
    return fail(429, {
      kind: 'organization-invitation-error' as const,
      message: 'Too many membership changes. Try again shortly.',
    });
  }
  if (rateLimit === 'unavailable') {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  try {
    const authGateway = gateway ?? organizationInvitationGateway(event);
    await authGateway.createInvitation({
      headers: event.request.headers,
      body: { email: input.email, resend: true, role: pending.role },
    });
  } catch (cause) {
    if (cause instanceof OrganizationInvitationDeliveryFailed) {
      await recordOrganizationAudit(
        env.DB,
        event.request,
        organizationId,
        'organization.invitation.delivery_failed',
        pending.role
      );
    }
    return organizationInvitationFailure(cause, 'resend');
  }
  await recordOrganizationAudit(
    env.DB,
    event.request,
    organizationId,
    'organization.invitation.resent',
    pending.role
  );
  redirect(303, '/dashboard/organization/members/');
}

/** Revoke the pending invitation for one normalized employee email. */
export async function revokeOrganizationInvitationAction(
  event: OrganizationActionEvent,
  gateway: OrganizationInvitationAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const input = await readActionInput(readOrganizationInvitationEmailForm(event.request));
  if (input instanceof OrganizationInvitationFormInvalid) {
    return organizationInvitationFailure(input, 'revoke');
  }
  const guard = await requireVerifiedOrganizationIdentity(
    event,
    identityLoader,
    'organization-invitation-error'
  );
  if (!('identity' in guard)) {
    return guard;
  }
  const { identity, serverIdentity, env } = guard;
  let pending: Awaited<ReturnType<typeof findPendingOrganizationInvitation>>;
  try {
    pending = await findPendingOrganizationInvitation(serverIdentity, input.email, env.DB);
  } catch (cause) {
    return organizationInvitationFailure(cause, 'revoke');
  }
  if (pending === null) {
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'revoke');
  }
  let organizationId: string | null;
  try {
    organizationId = await loadActiveOrganizationId(serverIdentity, env.DB);
  } catch (cause) {
    return organizationInvitationFailure(cause, 'revoke');
  }
  if (organizationId === null) {
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'revoke');
  }
  const limited = await guardOrganizationMutationRate(
    event,
    organizationId,
    identity.user.id,
    'organization-invitation-error'
  );
  if (limited !== undefined) {
    return limited;
  }
  try {
    const authGateway = gateway ?? organizationInvitationGateway(event);
    await authGateway.cancelInvitation({
      headers: event.request.headers,
      body: { invitationId: pending.id },
    });
  } catch (cause) {
    return organizationInvitationFailure(cause, 'revoke');
  }
  await recordOrganizationAudit(
    env.DB,
    event.request,
    organizationId,
    'organization.invitation.revoked',
    pending.role
  );
  redirect(303, '/dashboard/organization/members/');
}

/** Accept the invitation stored in the recipient's temporary HttpOnly cookie. */
export async function acceptOrganizationInvitationAction(
  event: OrganizationInvitationAcceptanceEvent,
  gateway: OrganizationInvitationAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const reference = event.cookies.get(ORGANIZATION_INVITATION_REFERENCE_COOKIE);
  if (reference === undefined) {
    return fail(400, {
      kind: 'organization-invitation-error' as const,
      message: 'This invitation is invalid or has expired.',
    });
  }
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const identity = await identityLoader(event);
  if (identity === null) {
    redirect(302, '/login/?next=/dashboard/organization/invitations/accept/');
  }
  if (!identity.user.emailVerified) {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message: 'Verify your email before accepting this invitation.',
    });
  }
  const invitationIdExit = await Effect.runPromiseExit(
    resolveOrganizationInvitationReference(reference, event.platform.env.BETTER_AUTH_SECRET)
  );
  if (Exit.isFailure(invitationIdExit)) {
    event.cookies.delete(ORGANIZATION_INVITATION_REFERENCE_COOKIE, {
      path: ORGANIZATION_INVITATION_ACCEPT_PATH,
    });
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'accept');
  }
  let organizationId: string | null;
  try {
    organizationId = await loadInvitationOrganizationId(
      { ...identity.user, sessionToken: identity.sessionToken },
      invitationIdExit.value,
      event.platform.env.DB
    );
  } catch (cause) {
    return organizationInvitationFailure(cause, 'accept');
  }
  if (organizationId === null) {
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'accept');
  }
  const rateLimit = await organizationMutationRateLimit(event, identity.user.id);
  if (rateLimit === 'limited') {
    return fail(429, {
      kind: 'organization-invitation-error' as const,
      message: 'Too many membership changes. Try again shortly.',
    });
  }
  if (rateLimit === 'unavailable') {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  try {
    const authGateway = gateway ?? organizationInvitationGateway(event);
    await authGateway.acceptInvitation({
      headers: event.request.headers,
      body: { invitationId: invitationIdExit.value },
    });
  } catch (cause) {
    return organizationInvitationFailure(cause, 'accept');
  }
  await recordOrganizationAudit(
    event.platform.env.DB,
    event.request,
    organizationId,
    'organization.invitation.accepted'
  );
  event.cookies.delete(ORGANIZATION_INVITATION_REFERENCE_COOKIE, {
    path: ORGANIZATION_INVITATION_ACCEPT_PATH,
  });
  redirect(303, '/dashboard/organization/');
}

/** Reject the invitation stored in the recipient's temporary HttpOnly cookie. */
export async function rejectOrganizationInvitationAction(
  event: OrganizationInvitationAcceptanceEvent,
  gateway: OrganizationInvitationAuthGateway | undefined = undefined,
  identityLoader: IdentityLoader = defaultIdentityLoader
) {
  const reference = event.cookies.get(ORGANIZATION_INVITATION_REFERENCE_COOKIE);
  if (reference === undefined) {
    return fail(400, {
      kind: 'organization-invitation-error' as const,
      message: 'This invitation is invalid or has expired.',
    });
  }
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const identity = await identityLoader(event);
  if (identity === null) {
    redirect(302, '/login/?next=/dashboard/organization/invitations/accept/');
  }
  if (!identity.user.emailVerified) {
    return fail(403, {
      kind: 'organization-invitation-error' as const,
      message: 'Verify your email before responding to this invitation.',
    });
  }
  const invitationIdExit = await Effect.runPromiseExit(
    resolveOrganizationInvitationReference(reference, event.platform.env.BETTER_AUTH_SECRET)
  );
  if (Exit.isFailure(invitationIdExit)) {
    event.cookies.delete(ORGANIZATION_INVITATION_REFERENCE_COOKIE, {
      path: ORGANIZATION_INVITATION_ACCEPT_PATH,
    });
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'reject');
  }
  let organizationId: string | null;
  try {
    organizationId = await loadInvitationOrganizationId(
      { ...identity.user, sessionToken: identity.sessionToken },
      invitationIdExit.value,
      event.platform.env.DB
    );
  } catch (cause) {
    return organizationInvitationFailure(cause, 'reject');
  }
  if (organizationId === null) {
    return organizationInvitationFailure(new OrganizationInvitationNotFound(), 'reject');
  }
  const rateLimit = await organizationMutationRateLimit(event, identity.user.id);
  if (rateLimit === 'limited') {
    return fail(429, {
      kind: 'organization-invitation-error' as const,
      message: 'Too many membership changes. Try again shortly.',
    });
  }
  if (rateLimit === 'unavailable') {
    return fail(503, {
      kind: 'organization-invitation-error' as const,
      message: 'Organization membership is temporarily unavailable.',
    });
  }
  try {
    const authGateway = gateway ?? organizationInvitationGateway(event);
    await authGateway.rejectInvitation({
      headers: event.request.headers,
      body: { invitationId: invitationIdExit.value },
    });
  } catch (cause) {
    return organizationInvitationFailure(cause, 'reject');
  }
  await recordOrganizationAudit(
    event.platform.env.DB,
    event.request,
    organizationId,
    'organization.invitation.rejected'
  );
  event.cookies.delete(ORGANIZATION_INVITATION_REFERENCE_COOKIE, {
    path: ORGANIZATION_INVITATION_ACCEPT_PATH,
  });
  redirect(303, '/dashboard/');
}

/** Create the organization after validating its bounded bootstrap form. */
export async function createOrganizationAction(event: OrganizationActionEvent) {
  const inputExit = await Effect.runPromiseExit(readOrganizationBootstrapForm(event.request));
  if (Exit.isFailure(inputExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(inputExit.cause));
    return fail(failure instanceof OrganizationBootstrapInvalid ? failure.status : 400, {
      kind: 'organization-error' as const,
      message: 'Enter a valid workspace name and URL slug.',
    });
  }
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }

  try {
    await bootstrapOrganization(
      { ...identity.user, sessionToken: identity.sessionToken },
      event.platform.env.DB,
      inputExit.value
    );
  } catch (cause) {
    if (cause instanceof OrganizationBootstrapExisting) {
      redirect(303, '/dashboard/organization/');
    }
    if (cause instanceof OrganizationBootstrapForbidden) {
      return fail(403, {
        kind: 'organization-error' as const,
        message: 'An active Team or Enterprise plan is required.',
      });
    }
    if (cause instanceof OrganizationBootstrapConflict) {
      return fail(409, {
        kind: 'organization-error' as const,
        message: 'That workspace address is unavailable. Choose another.',
      });
    }
    if (cause instanceof OrganizationBootstrapUnavailable) {
      return fail(503, {
        kind: 'organization-error' as const,
        message: 'Organization workspace is temporarily unavailable.',
      });
    }
    return fail(503, {
      kind: 'organization-error' as const,
      message: 'Organization workspace is temporarily unavailable.',
    });
  }

  redirect(303, '/dashboard/organization/');
}
