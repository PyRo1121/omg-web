import { error, redirect } from '@sveltejs/kit';
import { loadAccountIdentity } from '../../../../lib/server/account-dashboard.server';
import {
  loadOrganizationAuditState,
  OrganizationAuditQueryInvalid,
  readOrganizationAuditQuery,
} from '../../../../lib/server/organization-audit.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  if (event.platform === undefined) {
    error(503, 'Organization audit service unavailable');
  }
  event.setHeaders({ 'Cache-Control': 'private, no-store' });
  let query;
  try {
    query = readOrganizationAuditQuery(event.url.searchParams);
  } catch (cause) {
    if (cause instanceof OrganizationAuditQueryInvalid) {
      error(400, 'Organization audit query is invalid');
    }
    throw cause;
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
