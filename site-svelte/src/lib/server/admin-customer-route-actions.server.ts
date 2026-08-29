import { error, fail, redirect } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import {
  readAdminBillingPortalRequest,
  readAdminCustomerLicenseUpdate,
  readAdminCustomerNoteCreate,
  readAdminCustomerNoteDelete,
  readAdminCustomerSelection,
  readAdminCustomerTagAssignment,
  readAdminCustomerTagCreate,
} from './admin-customer-form.server';
import {
  AdminCustomerMutationTargetChanged,
  changeAdminCustomerTag,
  createAdminCustomerBillingPortal,
  createAdminCustomerNote,
  createAdminCustomerTag,
  deleteAdminCustomerNote,
} from './admin-customer-mutations.server';
import { loadAdminCustomerWorkspace } from './admin-customer-support.server';
import { updateAdminCustomerLicense } from './admin-customers.server';
import { loadAccountIdentity } from './account-dashboard.server';
import { BoundedFormRejected } from './bounded-form.server';
import {
  AdminOverviewForbidden,
  LicensingSummaryInvalidInput,
  LicensingSummaryWorkerRejected,
  type LicensingSummaryEnvironment,
  type LicensingSummaryIdentity,
} from './licensing-service.server';

export interface AdminCustomerRequestEvent {
  readonly platform: App.Platform | undefined;
  readonly request: Request;
  readonly url: URL;
}

export async function requireAdminCustomerIdentity(event: AdminCustomerRequestEvent) {
  if (event.platform === undefined) {
    error(503, 'Admin service unavailable');
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return { env: event.platform.env, identity: identity.user };
}

export async function inspectAdminCustomer(event: AdminCustomerRequestEvent) {
  const emailExit = await Effect.runPromiseExit(readAdminCustomerSelection(event.request));
  if (Exit.isFailure(emailExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(emailExit.cause));
    return fail(failure instanceof BoundedFormRejected ? failure.status : 400, {
      kind: 'error' as const,
      message: 'Select a valid customer.',
    });
  }
  const { env, identity } = await requireAdminCustomerIdentity(event);
  const exit = await Effect.runPromiseExit(
    loadAdminCustomerWorkspace(identity, env, emailExit.value)
  );
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
    if (failure instanceof AdminOverviewForbidden) {
      error(403, 'Admin access required');
    }
    return fail(503, { kind: 'error' as const, message: 'Customer detail unavailable.' });
  }
  return {
    kind: 'detail' as const,
    detail: exit.value.detail,
    support: exit.value.support,
  };
}

interface AdminCustomerMutationMessages {
  readonly invalid: string;
  readonly failed: string;
  readonly succeeded: string;
}

type AdminCustomerMutation<I> = (
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment,
  input: I
) => Effect.Effect<void, unknown>;

async function runAdminCustomerMutation<I>(
  event: AdminCustomerRequestEvent,
  inputEffect: Effect.Effect<I, unknown>,
  mutate: AdminCustomerMutation<I>,
  emailOf: (input: I) => string,
  messages: AdminCustomerMutationMessages
) {
  const inputExit = await Effect.runPromiseExit(inputEffect);
  if (Exit.isFailure(inputExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(inputExit.cause));
    return fail(failure instanceof BoundedFormRejected ? failure.status : 400, {
      kind: 'error' as const,
      message: messages.invalid,
    });
  }
  const { env, identity } = await requireAdminCustomerIdentity(event);
  const mutationExit = await Effect.runPromiseExit(mutate(identity, env, inputExit.value));
  if (Exit.isFailure(mutationExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(mutationExit.cause));
    if (failure instanceof AdminOverviewForbidden) {
      error(403, 'Admin access required');
    }
    if (failure instanceof AdminCustomerMutationTargetChanged) {
      return fail(409, {
        kind: 'error' as const,
        message: 'Customer support data changed. Inspect the customer again before retrying.',
      });
    }
    if (failure instanceof LicensingSummaryInvalidInput) {
      return fail(400, { kind: 'error' as const, message: messages.invalid });
    }
    if (failure instanceof LicensingSummaryWorkerRejected) {
      if (failure.status === 403) {
        error(403, 'Admin access required');
      }
      if (failure.status === 401) {
        return fail(401, {
          kind: 'error' as const,
          message: 'Sign in again before changing customer support data.',
        });
      }
      if (failure.status === 400 || failure.status === 404) {
        return fail(failure.status, { kind: 'error' as const, message: messages.invalid });
      }
      if (failure.status === 429) {
        return fail(429, {
          kind: 'error' as const,
          message: 'Too many support requests. Try again later.',
        });
      }
    }
    return fail(503, { kind: 'error' as const, message: messages.failed });
  }
  const workspaceExit = await Effect.runPromiseExit(
    loadAdminCustomerWorkspace(identity, env, emailOf(inputExit.value))
  );
  if (Exit.isFailure(workspaceExit)) {
    return {
      kind: 'updated' as const,
      message: `${messages.succeeded} Inspect the customer again to view current state.`,
    };
  }
  return {
    kind: 'updated' as const,
    message: messages.succeeded,
    detail: workspaceExit.value.detail,
    support: workspaceExit.value.support,
  };
}

export async function updateAdminCustomerLicenseAction(event: AdminCustomerRequestEvent) {
  const inputExit = await Effect.runPromiseExit(readAdminCustomerLicenseUpdate(event.request));
  if (Exit.isFailure(inputExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(inputExit.cause));
    return fail(failure instanceof BoundedFormRejected ? failure.status : 400, {
      kind: 'error' as const,
      message: 'Choose valid license values and confirm the change.',
    });
  }
  const { env, identity } = await requireAdminCustomerIdentity(event);
  const updateExit = await Effect.runPromiseExit(
    updateAdminCustomerLicense(identity, env, inputExit.value)
  );
  if (Exit.isFailure(updateExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(updateExit.cause));
    if (failure instanceof AdminOverviewForbidden) {
      error(403, 'Admin access required');
    }
    return fail(503, { kind: 'error' as const, message: 'License update failed.' });
  }
  const workspaceExit = await Effect.runPromiseExit(
    loadAdminCustomerWorkspace(identity, env, inputExit.value.email)
  );
  if (Exit.isFailure(workspaceExit)) {
    return {
      kind: 'updated' as const,
      message: 'License updated. Refresh the customer detail to view current state.',
    };
  }
  return {
    kind: 'updated' as const,
    message: 'License access updated and recorded in the audit log.',
    detail: workspaceExit.value.detail,
    support: workspaceExit.value.support,
  };
}

export function createAdminCustomerNoteAction(event: AdminCustomerRequestEvent) {
  return runAdminCustomerMutation(
    event,
    readAdminCustomerNoteCreate(event.request),
    createAdminCustomerNote,
    input => input.email,
    {
      invalid: 'Enter a valid support note.',
      failed: 'Support note creation failed.',
      succeeded: 'Support note created and recorded in the audit log.',
    }
  );
}

export function deleteAdminCustomerNoteAction(event: AdminCustomerRequestEvent) {
  return runAdminCustomerMutation(
    event,
    readAdminCustomerNoteDelete(event.request),
    deleteAdminCustomerNote,
    input => input.email,
    {
      invalid: 'Choose a valid note and confirm deletion.',
      failed: 'Support note deletion failed.',
      succeeded: 'Support note deleted and recorded in the audit log.',
    }
  );
}

export function changeAdminCustomerTagAction(event: AdminCustomerRequestEvent) {
  return runAdminCustomerMutation(
    event,
    readAdminCustomerTagAssignment(event.request),
    changeAdminCustomerTag,
    input => input.email,
    {
      invalid: 'Choose a valid customer tag action.',
      failed: 'Customer tag update failed.',
      succeeded: 'Customer tags updated and recorded in the audit log.',
    }
  );
}

export function createAdminCustomerTagAction(event: AdminCustomerRequestEvent) {
  return runAdminCustomerMutation(
    event,
    readAdminCustomerTagCreate(event.request),
    createAdminCustomerTag,
    input => input.email,
    {
      invalid: 'Enter a valid tag name and color.',
      failed: 'Customer tag creation failed.',
      succeeded: 'Customer tag created and recorded in the audit log.',
    }
  );
}

export async function openAdminCustomerBillingPortalAction(event: AdminCustomerRequestEvent) {
  const inputExit = await Effect.runPromiseExit(readAdminBillingPortalRequest(event.request));
  if (Exit.isFailure(inputExit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(inputExit.cause));
    return fail(failure instanceof BoundedFormRejected ? failure.status : 400, {
      kind: 'error' as const,
      message: 'Confirm the delegated billing request.',
    });
  }
  const { env, identity } = await requireAdminCustomerIdentity(event);
  const portalExit = await Effect.runPromiseExit(
    createAdminCustomerBillingPortal(identity, env, inputExit.value)
  );
  if (Exit.isSuccess(portalExit)) {
    redirect(303, portalExit.value.url, { external: ['https://billing.stripe.com'] });
  }
  const failure = Option.getOrNull(Cause.findErrorOption(portalExit.cause));
  if (failure instanceof AdminOverviewForbidden) {
    error(403, 'Admin access required');
  }
  if (failure instanceof LicensingSummaryWorkerRejected) {
    if (failure.status === 403) {
      error(403, 'Admin access required');
    }
    if (failure.status === 401) {
      return fail(401, {
        kind: 'error' as const,
        message: 'Sign in again before opening customer billing settings.',
      });
    }
    if (failure.status === 404) {
      return fail(404, {
        kind: 'error' as const,
        message: 'No billing account is linked to this customer.',
      });
    }
    if (failure.status === 429) {
      return fail(429, {
        kind: 'error' as const,
        message: 'Too many billing requests. Try again later.',
      });
    }
  }
  return fail(503, {
    kind: 'error' as const,
    message: 'Customer billing settings are temporarily unavailable.',
  });
}
