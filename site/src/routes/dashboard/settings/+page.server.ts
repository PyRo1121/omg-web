import { error, redirect } from '@sveltejs/kit';
import { loadAccountDashboardContext } from '../../../lib/server/account-dashboard.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Settings service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const context = await loadAccountDashboardContext(event);
  if (context === null) {
    redirect(302, '/login/');
  }
  return { dashboard: context.dashboard };
};
