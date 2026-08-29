import { error } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import {
  changeAdminCustomerTagAction,
  createAdminCustomerNoteAction,
  createAdminCustomerTagAction,
  deleteAdminCustomerNoteAction,
  inspectAdminCustomer,
  openAdminCustomerBillingPortalAction,
  requireAdminCustomerIdentity,
  updateAdminCustomerLicenseAction,
} from '../../../lib/server/admin-customer-route-actions.server';
import {
  loadAdminCustomers,
  parseAdminCustomerDirectoryQuery,
} from '../../../lib/server/admin-customers.server';
import { AdminOverviewForbidden } from '../../../lib/server/licensing-service.server';
import type { Actions, PageServerLoad } from './$types';

function rejectAdminFailure(exit: Exit.Exit<unknown, unknown>, message: string): never {
  const failure = Exit.isFailure(exit) ? Option.getOrNull(Cause.findErrorOption(exit.cause)) : null;
  if (failure instanceof AdminOverviewForbidden) {
    error(403, 'Admin access required');
  }
  error(503, message);
}

export const load: PageServerLoad = async event => {
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const { env, identity } = await requireAdminCustomerIdentity(event);
  const query = parseAdminCustomerDirectoryQuery(event.url);
  if (query === null) {
    error(400, 'Invalid customer directory query');
  }
  const exit = await Effect.runPromiseExit(
    loadAdminCustomers(identity, env, query.page, query.search)
  );
  if (Exit.isFailure(exit)) {
    rejectAdminFailure(exit, 'Customer directory unavailable');
  }
  return {
    directory: exit.value,
    operatorName: identity.name,
    search: query.search,
  };
};

export const actions = {
  inspect: inspectAdminCustomer,
  updateLicense: updateAdminCustomerLicenseAction,
  createNote: createAdminCustomerNoteAction,
  deleteNote: deleteAdminCustomerNoteAction,
  changeTag: changeAdminCustomerTagAction,
  createTag: createAdminCustomerTagAction,
  openBilling: openAdminCustomerBillingPortalAction,
} satisfies Actions;
