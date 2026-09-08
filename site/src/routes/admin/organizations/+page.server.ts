import { error } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { requireAdminPageContext } from '../../../lib/server/admin-page.server';
import {
  loadAdminOrganizations,
  parseAdminOrganizationQuery,
} from '../../../lib/server/admin-organizations.server';
import { AdminOverviewForbidden } from '../../../lib/server/licensing-service.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const { env, identity } = await requireAdminPageContext(event);
  const query = parseAdminOrganizationQuery(event.url);
  if (query === null) {
    error(400, 'Invalid organization directory query');
  }
  const exit = await Effect.runPromiseExit(
    loadAdminOrganizations(identity, env, query.page, query.search)
  );
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
    if (failure instanceof AdminOverviewForbidden) {
      error(403, 'Admin access required');
    }
    error(503, 'Organization directory unavailable');
  }
  return { directory: exit.value, operatorName: identity.name, search: query.search };
};
