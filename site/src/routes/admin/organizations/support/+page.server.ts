import { error } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { requireAdminPageContext } from '../../../../lib/server/admin-page.server';
import {
  loadAdminOrganizationSupport,
  parseAdminOrganizationSupportQuery,
} from '../../../../lib/server/admin-organizations.server';
import {
  AdminOverviewForbidden,
  LicensingSummaryWorkerRejected,
} from '../../../../lib/server/licensing-service.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const { env, identity } = await requireAdminPageContext(event);
  const slug = parseAdminOrganizationSupportQuery(event.url);
  if (slug === null) {
    error(400, 'Invalid organization support query');
  }

  const exit = await Effect.runPromiseExit(loadAdminOrganizationSupport(identity, env, slug));
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
    if (failure instanceof AdminOverviewForbidden) {
      error(403, 'Admin access required');
    }
    if (failure instanceof LicensingSummaryWorkerRejected && failure.status === 404) {
      error(404, 'Organization not found');
    }
    error(503, 'Organization support unavailable');
  }

  return { operatorName: identity.name, support: exit.value };
};
