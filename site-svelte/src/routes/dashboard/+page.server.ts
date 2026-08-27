import { error, redirect } from '@sveltejs/kit';
import { loadAccountDashboard } from '../../lib/server/account-dashboard.server';
import { loadLicensingSummaryState } from '../../lib/server/licensing-summary.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Dashboard service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });

  const dashboard = await loadAccountDashboard(event);
  if (dashboard === null) {
    redirect(302, '/login/');
  }

  const licensing = await loadLicensingSummaryState(dashboard.user, event.platform.env);
  const currentSession = dashboard.sessions.find(session => session.isCurrent);
  return {
    ...dashboard,
    currentSessionExpiresAt: currentSession?.expiresAt ?? null,
    licensing,
  };
};
