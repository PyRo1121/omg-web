import { error, fail, redirect } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import {
  readAdminCustomerLicenseUpdate,
  readAdminCustomerSelection,
} from './admin-customer-form.server';
import { loadAdminCustomerWorkspace } from './admin-customer-support.server';
import { updateAdminCustomerLicense } from './admin-customers.server';
import { loadAccountIdentity } from './account-dashboard.server';
import { BoundedFormRejected } from './bounded-form.server';
import { AdminOverviewForbidden } from './licensing-service.server';

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
