import { error, redirect } from '@sveltejs/kit';
import { loadAccountIdentity } from '../../../../lib/server/account-dashboard.server';
import { loadOrganizationMembersState } from '../../../../lib/server/organization-workspace.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Organization service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return {
    organization: await loadOrganizationMembersState(
      { ...identity.user, sessionToken: identity.sessionToken },
      event.platform.env.DB
    ),
  };
};
