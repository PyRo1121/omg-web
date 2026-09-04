import { error, redirect } from '@sveltejs/kit';
import { loadAccountIdentity } from '../../../../lib/server/account-dashboard.server';
import { loadOrganizationUsageState } from '../../../../lib/server/organization-usage.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Organization usage service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return {
    organizationUsage: await loadOrganizationUsageState(
      { ...identity.user, sessionToken: identity.sessionToken },
      event.platform.env
    ),
  };
};
