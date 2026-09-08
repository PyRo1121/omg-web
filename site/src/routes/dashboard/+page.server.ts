import { error, redirect } from '@sveltejs/kit';
import { loadAccountIdentity } from '../../lib/server/account-dashboard.server';
import { loadLicensingSummaryState } from '../../lib/server/licensing-service.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Dashboard service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });

  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }

  return {
    user: {
      name: identity.user.name,
      email: identity.user.email,
      emailVerified: identity.user.emailVerified,
      createdAt: identity.user.createdAt,
    },
    licensing: await loadLicensingSummaryState(identity.user, event.platform.env),
  };
};
