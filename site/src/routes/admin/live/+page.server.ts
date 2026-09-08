import { Effect } from 'effect';
import { loadAdminFirehose } from '../../../lib/server/admin-operations.server';
import { adminPageValue, requireAdminPageContext } from '../../../lib/server/admin-page.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const { env, identity } = await requireAdminPageContext(event);
  const exit = await Effect.runPromiseExit(loadAdminFirehose(identity, env, null));
  return { live: adminPageValue(exit, 'Live operator feed unavailable') };
};
