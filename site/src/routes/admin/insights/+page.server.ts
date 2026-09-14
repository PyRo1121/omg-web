import { Effect } from 'effect';
import { loadAdminInsights } from '../../../lib/server/admin-intelligence.server';
import { adminPageValue, requireAdminPageContext } from '../../../lib/server/admin-page.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const { env, identity } = await requireAdminPageContext(event);
  const exit = await Effect.runPromiseExit(loadAdminInsights(identity, env));
  return { insights: adminPageValue(exit, 'Operator insights unavailable') };
};
