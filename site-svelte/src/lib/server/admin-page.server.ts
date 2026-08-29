import { error, redirect } from '@sveltejs/kit';
import { Cause, Exit, Option } from 'effect';
import { loadAccountIdentity } from './account-dashboard.server';
import { AdminOverviewForbidden } from './licensing-service.server';

export interface AdminPageEvent {
  readonly platform: App.Platform | undefined;
  readonly request: Request;
  readonly url: URL;
  readonly setHeaders: (headers: Record<string, string>) => void;
}

/** Establish one private verified operator context before loading a capability. */
export async function requireAdminPageContext(event: AdminPageEvent) {
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  if (event.platform === undefined) {
    error(503, 'Admin service unavailable');
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return { env: event.platform.env, identity: identity.user };
}

/** Map a typed admin service exit without exposing transport or persistence details. */
export function adminPageValue<A>(exit: Exit.Exit<A, unknown>, unavailableMessage: string): A {
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
  if (failure instanceof AdminOverviewForbidden) {
    error(403, 'Admin access required');
  }
  error(503, unavailableMessage);
}
