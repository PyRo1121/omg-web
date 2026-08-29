import { error } from '@sveltejs/kit';
import { Effect } from 'effect';
import {
  loadAdminAnalytics,
  parseAdminAnalyticsDays,
} from '../../../lib/server/admin-intelligence.server';
import { adminPageValue, requireAdminPageContext } from '../../../lib/server/admin-page.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const days = parseAdminAnalyticsDays(event.url);
  if (days === null) error(400, 'Invalid analytics period');
  const { env, identity } = await requireAdminPageContext(event);
  const exit = await Effect.runPromiseExit(loadAdminAnalytics(identity, env, days));
  return {
    analytics: adminPageValue(exit, 'Operator analytics unavailable'),
    days,
  };
};
