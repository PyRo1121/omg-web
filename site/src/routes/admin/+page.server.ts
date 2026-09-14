import { error, redirect } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { loadAccountIdentity } from '../../lib/server/account-dashboard.server';
import {
  AdminOverviewForbidden,
  loadAdminOverview,
} from '../../lib/server/licensing-service.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Admin service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });

  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }

  const exit = await Effect.runPromiseExit(loadAdminOverview(identity.user, event.platform.env));
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
    if (failure instanceof AdminOverviewForbidden) {
      error(403, 'Admin access required');
    }
    error(503, 'Admin data unavailable');
  }

  return {
    operatorName: identity.user.name,
    overview: exit.value,
  };
};
