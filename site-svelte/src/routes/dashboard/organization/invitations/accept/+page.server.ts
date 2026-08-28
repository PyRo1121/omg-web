import { error, redirect } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { loadAccountIdentity } from '../../../../../lib/server/account-dashboard.server';
import {
  acceptOrganizationInvitationAction,
  rejectOrganizationInvitationAction,
} from '../../../../../lib/server/organization-route-actions.server';
import {
  ORGANIZATION_INVITATION_ACCEPT_PATH,
  ORGANIZATION_INVITATION_REFERENCE_COOKIE,
  OrganizationInvitationReferenceInvalid,
  OrganizationInvitationReferenceUnavailable,
  resolveOrganizationInvitationReference,
} from '../../../../../lib/server/organization-invitation-token.server';
import type { Actions, PageServerLoad } from './$types';

const INVITATION_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60 * 48,
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
};
const INVALID_INVITATION = { status: 'invalid' as const };

function resolveFailure(
  cause: Cause.Cause<unknown>
): OrganizationInvitationReferenceInvalid | OrganizationInvitationReferenceUnavailable | null {
  const failure = Option.getOrNull(Cause.findErrorOption(cause));
  return failure instanceof OrganizationInvitationReferenceInvalid ||
    failure instanceof OrganizationInvitationReferenceUnavailable
    ? failure
    : null;
}

async function resolveReference(reference: string, secret: string) {
  const result = await Effect.runPromiseExit(
    resolveOrganizationInvitationReference(reference, secret)
  );
  if (Exit.isSuccess(result)) {
    return result.value;
  }
  const failure = resolveFailure(result.cause);
  if (failure instanceof OrganizationInvitationReferenceUnavailable) {
    error(503, 'Organization invitation service unavailable');
  }
  return null;
}

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Organization invitation service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });

  const queryReferences = event.url.searchParams.getAll('token');
  if (queryReferences.length > 1) {
    return { invitation: INVALID_INVITATION };
  }
  const queryReference = queryReferences[0];
  if (queryReference !== undefined) {
    const invitationId = await resolveReference(
      queryReference,
      event.platform.env.BETTER_AUTH_SECRET
    );
    if (invitationId === null) {
      return { invitation: INVALID_INVITATION };
    }
    event.cookies.set(
      ORGANIZATION_INVITATION_REFERENCE_COOKIE,
      queryReference,
      INVITATION_COOKIE_OPTIONS
    );
    redirect(303, ORGANIZATION_INVITATION_ACCEPT_PATH);
  }

  const cookieReference = event.cookies.get(ORGANIZATION_INVITATION_REFERENCE_COOKIE);
  if (cookieReference === undefined) {
    return { invitation: INVALID_INVITATION };
  }
  const invitationId = await resolveReference(
    cookieReference,
    event.platform.env.BETTER_AUTH_SECRET
  );
  if (invitationId === null) {
    event.cookies.delete(ORGANIZATION_INVITATION_REFERENCE_COOKIE, { path: '/' });
    return { invitation: INVALID_INVITATION };
  }

  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, `/login/?next=${encodeURIComponent(ORGANIZATION_INVITATION_ACCEPT_PATH)}`);
  }
  return {
    invitation: identity.user.emailVerified
      ? { status: 'ready' as const }
      : { status: 'verification-required' as const },
  };
};

export const actions = {
  accept: acceptOrganizationInvitationAction,
  reject: rejectOrganizationInvitationAction,
} satisfies Actions;
