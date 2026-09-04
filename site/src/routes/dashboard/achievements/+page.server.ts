import { error, redirect } from '@sveltejs/kit';
import { loadAccountAchievementsState } from '../../../lib/server/account-achievements.server';
import { loadAccountIdentity } from '../../../lib/server/account-dashboard.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Achievements service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return {
    achievements: await loadAccountAchievementsState(identity.user, event.platform.env),
  };
};
