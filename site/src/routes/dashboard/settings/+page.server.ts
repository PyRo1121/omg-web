import { error, redirect } from '@sveltejs/kit';
import { loadAccountDashboardContext } from '../../../lib/server/account-dashboard.server';
import { openBillingPortalAction } from '../../../lib/server/billing-action.server';
import type { Actions, PageServerLoad } from './$types';

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

export const actions = {
  openBillingPortal: openBillingPortalAction,
} satisfies Actions;
