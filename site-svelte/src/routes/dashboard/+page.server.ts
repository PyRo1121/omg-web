import { error, redirect } from '@sveltejs/kit';
import { loadAccountDashboardContext } from '../../lib/server/account-dashboard.server';
import { openBillingPortalAction } from '../../lib/server/billing-action.server';
import { loadLicensingSummaryState } from '../../lib/server/licensing-service.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Dashboard service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });

  const context = await loadAccountDashboardContext(event);
  if (context === null) {
    redirect(302, '/login/');
  }

  const licensing = await loadLicensingSummaryState(context.identity.user, event.platform.env);
  const currentSession = context.dashboard.sessions.find(session => session.isCurrent);
  return {
    ...context.dashboard,
    currentSessionExpiresAt: currentSession?.expiresAt ?? null,
    licensing,
  };
};

export const actions = {
  openBillingPortal: openBillingPortalAction,
} satisfies Actions;
