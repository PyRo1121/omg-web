import { error, redirect } from '@sveltejs/kit';
import { loadAccountIdentity } from '../../../../lib/server/account-dashboard.server';
import {
  loadOrganizationAuditState,
  readOrganizationAuditQuery,
} from '../../../../lib/server/organization-audit.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Organization audit service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  const query = readOrganizationAuditQuery(event.url.searchParams);
  if (query === null) {
    error(400, 'Organization audit query is invalid');
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  return {
    organizationAudit: await loadOrganizationAuditState(
      { ...identity.user, sessionToken: identity.sessionToken },
      query,
      event.platform.env
    ),
  };
};
