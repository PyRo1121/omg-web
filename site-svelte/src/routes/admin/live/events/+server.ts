import { error } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { loadAccountIdentity } from '../../../../lib/server/account-dashboard.server';
import {
  loadInternalAdminFirehose,
  parseFirehoseSince,
} from '../../../../lib/server/admin-operations.server';
import {
  AdminOverviewForbidden,
  requireAdminServiceAccess,
} from '../../../../lib/server/licensing-service.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async event => {
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  if (event.platform === undefined) error(503, 'Live feed unavailable');
  const since = parseFirehoseSince(event.url.searchParams.get('since'));
  if (since === undefined) error(400, 'Invalid live-feed cursor');
  const identity = await loadAccountIdentity(event);
  if (identity === null) error(401, 'Authentication required');
  const access = await Effect.runPromiseExit(
    requireAdminServiceAccess(identity.user, event.platform.env)
  );
  if (Exit.isFailure(access)) {
    const failure = Option.getOrNull(Cause.findErrorOption(access.cause));
    if (failure instanceof AdminOverviewForbidden) error(403, 'Admin access required');
    error(503, 'Live feed unavailable');
  }
  const rate = await event.platform.env.ADMIN_LIVE_RATE_LIMITER.limit({ key: identity.user.id });
  if (!rate.success) error(429, 'Live feed rate limit exceeded');

  const exit = await Effect.runPromiseExit(loadInternalAdminFirehose(event.platform.env, since));
  if (Exit.isSuccess(exit)) return Response.json(exit.value);
  const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
  if (failure instanceof AdminOverviewForbidden) error(403, 'Admin access required');
  error(503, 'Live feed unavailable');
};
