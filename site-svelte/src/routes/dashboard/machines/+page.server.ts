import { error, redirect } from '@sveltejs/kit';
import { loadAccountIdentity } from '../../../lib/server/account-dashboard.server';
import { loadAccountMachinesState } from '../../../lib/server/account-machines.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Machine service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return {
    machines: await loadAccountMachinesState(identity.user, event.platform.env),
  };
};
