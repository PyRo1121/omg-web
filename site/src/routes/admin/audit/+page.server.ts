import { error } from '@sveltejs/kit';
import { Effect } from 'effect';
import { loadAdminAudit, parseAdminAuditQuery } from '../../../lib/server/admin-operations.server';
import { adminPageValue, requireAdminPageContext } from '../../../lib/server/admin-page.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const query = parseAdminAuditQuery(event.url);
  if (query === null) error(400, 'Invalid audit filter');
  const { env, identity } = await requireAdminPageContext(event);
  const exit = await Effect.runPromiseExit(loadAdminAudit(identity, env, query));
  return {
    action: query.action ?? '',
    audit: adminPageValue(exit, 'Operator audit history unavailable'),
  };
};
