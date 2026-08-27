import { error, fail, redirect } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import * as Schema from 'effect/Schema';
import {
  ADMIN_CUSTOMER_STATUSES,
  ADMIN_CUSTOMER_TIERS,
} from '../../../../../site/shared/admin-customers';
import { EMAIL_PATTERN } from '../../../../../site/shared/email';
import {
  loadAdminCustomerDetail,
  loadAdminCustomers,
  parseAdminCustomerDirectoryQuery,
  updateAdminCustomerLicense,
} from '../../../lib/server/admin-customers.server';
import { loadAccountIdentity } from '../../../lib/server/account-dashboard.server';
import { AdminOverviewForbidden } from '../../../lib/server/licensing-service.server';
import type { Actions, PageServerLoad } from './$types';

const EmailFieldSchema = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isLowercased(),
  Schema.isPattern(EMAIL_PATTERN)
);
const CustomerUpdateFormSchema = Schema.Struct({
  email: EmailFieldSchema,
  tier: Schema.Literals(ADMIN_CUSTOMER_TIERS),
  status: Schema.Literals(ADMIN_CUSTOMER_STATUSES),
  confirmation: Schema.Literal('confirmed'),
});

function rejectAdminFailure(exit: Exit.Exit<unknown, unknown>, message: string): never {
  const failure = Exit.isFailure(exit) ? Option.getOrNull(Cause.findErrorOption(exit.cause)) : null;
  if (failure instanceof AdminOverviewForbidden) {
    error(403, 'Admin access required');
  }
  error(503, message);
}

interface AdminRequestEvent {
  readonly platform: App.Platform | undefined;
  readonly request: Request;
  readonly url: URL;
}

async function requireIdentity(event: AdminRequestEvent) {
  if (event.platform === undefined) {
    error(503, 'Admin service unavailable');
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return { env: event.platform.env, identity: identity.user };
}

export const load: PageServerLoad = async event => {
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const { env, identity } = await requireIdentity(event);
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

export const actions: Actions = {
  inspect: async event => {
    const { env, identity } = await requireIdentity(event);
    const formData = await event.request.formData();
    const emailExit = Schema.decodeUnknownExit(EmailFieldSchema)(formData.get('email'));
    if (Exit.isFailure(emailExit)) {
      return fail(400, { kind: 'error' as const, message: 'Select a valid customer.' });
    }
    const exit = await Effect.runPromiseExit(
      loadAdminCustomerDetail(identity, env, emailExit.value)
    );
    if (Exit.isFailure(exit)) {
      const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
      if (failure instanceof AdminOverviewForbidden) {
        error(403, 'Admin access required');
      }
      return fail(503, { kind: 'error' as const, message: 'Customer detail unavailable.' });
    }
    return { kind: 'detail' as const, detail: exit.value };
  },
  updateLicense: async event => {
    const { env, identity } = await requireIdentity(event);
    const formData = await event.request.formData();
    const inputExit = Schema.decodeUnknownExit(CustomerUpdateFormSchema)({
      email: formData.get('email'),
      tier: formData.get('tier'),
      status: formData.get('status'),
      confirmation: formData.get('confirmation'),
    });
    if (Exit.isFailure(inputExit)) {
      return fail(400, {
        kind: 'error' as const,
        message: 'Choose valid license values and confirm the change.',
      });
    }
    const updateExit = await Effect.runPromiseExit(
      updateAdminCustomerLicense(identity, env, {
        email: inputExit.value.email,
        tier: inputExit.value.tier,
        status: inputExit.value.status,
      })
    );
    if (Exit.isFailure(updateExit)) {
      const failure = Option.getOrNull(Cause.findErrorOption(updateExit.cause));
      if (failure instanceof AdminOverviewForbidden) {
        error(403, 'Admin access required');
      }
      return fail(503, { kind: 'error' as const, message: 'License update failed.' });
    }
    const detailExit = await Effect.runPromiseExit(
      loadAdminCustomerDetail(identity, env, inputExit.value.email)
    );
    if (Exit.isFailure(detailExit)) {
      return {
        kind: 'updated' as const,
        message: 'License updated. Refresh the customer detail to view current state.',
      };
    }
    return {
      kind: 'updated' as const,
      message: 'License access updated and recorded in the audit log.',
      detail: detailExit.value,
    };
  },
};
