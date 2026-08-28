import { error, fail, redirect } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { loadAccountIdentity } from './account-dashboard.server';
import {
  OrganizationBootstrapConflict,
  OrganizationBootstrapExisting,
  OrganizationBootstrapForbidden,
  OrganizationBootstrapInvalid,
  OrganizationBootstrapUnavailable,
  bootstrapOrganization,
  readOrganizationBootstrapForm,
} from './organization-workspace.server';

export interface OrganizationActionEvent {
  readonly platform: App.Platform | undefined;
  readonly request: Request;
  readonly url: URL;
}

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
