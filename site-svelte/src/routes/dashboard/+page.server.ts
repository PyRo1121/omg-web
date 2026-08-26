import { redirect } from '@sveltejs/kit';
import { loadAccountDashboard } from '../../lib/server/account-dashboard.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const dashboard = await loadAccountDashboard(event);
  if (dashboard === null) {
    redirect(302, '/login/');
  }

  const currentSession = dashboard.sessions.find(session => session.isCurrent);
  return {
    ...dashboard,
    currentSessionExpiresAt: currentSession?.expiresAt ?? null,
  };
};
