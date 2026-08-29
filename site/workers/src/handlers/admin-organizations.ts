import * as Schema from 'effect/Schema';
import type { AdminOrganizationDirectory } from '../../../shared/admin-organizations';
import type { Env } from '../api';
import { D1Number } from '../../../shared/d1-rows';
import { reportError } from '../observability';
import { secureJsonResponse, withAdminQuery } from './admin';

const PAGE_SIZE = 25;
const DirectoryRowSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  slug: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  tier: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  status: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  seatsUsed: D1Number,
  seatLimit: Schema.NullOr(Schema.Number),
  pendingInvitations: D1Number,
  activeMachines: D1Number,
  lastAuditAt: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
});
const CountRowSchema = Schema.Struct({ total: D1Number });

function oneParameter(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length <= 1 ? (values[0] ?? null) : null;
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/** Return a browser-safe organization directory for an authorized operator. */
export async function handleAdminOrganizations(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (_context, url) => {
    const rawPage = oneParameter(url, 'page') ?? '1';
    const rawSearch = oneParameter(url, 'search') ?? '';
    if (!/^\d{1,2}$/u.test(rawPage) || rawSearch.length > 100) {
      return secureJsonResponse({ error: 'Invalid organization directory query' }, 400);
    }
    const page = Number(rawPage);
    if (!Number.isSafeInteger(page) || page < 1 || page > 40) {
      return secureJsonResponse({ error: 'Invalid organization directory query' }, 400);
    }
    const search = rawSearch.trim().toLowerCase();
    const pattern = `%${escapeLike(search)}%`;
    const where =
      search.length === 0
        ? ''
        : `WHERE lower(organization.name) LIKE ? ESCAPE '\\'
          OR lower(organization.slug) LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM auth_member AS searched_member
            JOIN auth_user AS searched_user ON searched_user.id = searched_member.user_id
            WHERE searched_member.organization_id = organization.id
              AND lower(searched_user.email) LIKE ? ESCAPE '\\'
          )`;
    const params = search.length === 0 ? [] : [pattern, pattern, pattern];
    try {
      const countValue = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM auth_organization AS organization ${where}`
      )
        .bind(...params)
        .first();
      const count = Schema.decodeUnknownSync(CountRowSchema)(countValue);
      const result = await env.DB.prepare(
        `SELECT
          organization.name,
          organization.slug,
          license.tier,
          license.status,
          license.max_seats AS seatLimit,
          (SELECT COUNT(*) FROM auth_member AS member
            WHERE member.organization_id = organization.id) AS seatsUsed,
          (SELECT COUNT(*) FROM auth_invitation AS invitation
            WHERE invitation.organization_id = organization.id
              AND invitation.status = 'pending') AS pendingInvitations,
          (SELECT COUNT(*) FROM machines AS machine
            WHERE machine.license_id = license.id AND machine.is_active = 1) AS activeMachines,
          (SELECT MAX(audit.created_at) FROM audit_log AS audit
            WHERE audit.customer_id = organization.billing_customer_id
              AND audit.resource_type = 'organization'
              AND audit.action LIKE 'organization.%') AS lastAuditAt
        FROM auth_organization AS organization
        LEFT JOIN licenses AS license ON license.customer_id = organization.billing_customer_id
        ${where}
        ORDER BY organization.created_at DESC, organization.slug
        LIMIT ? OFFSET ?`
      )
        .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
        .all();
      const rows = Schema.decodeUnknownSync(Schema.Array(DirectoryRowSchema))(result.results);
      const directory: AdminOrganizationDirectory = {
        organizations: rows.map(row => ({
          name: row.name.trim(),
          slug: row.slug,
          tier: row.tier ?? 'unavailable',
          status: row.status ?? 'unavailable',
          seatsUsed: row.seatsUsed,
          seatLimit:
            row.seatLimit !== null && Number.isSafeInteger(row.seatLimit) && row.seatLimit >= 1
              ? row.seatLimit
              : null,
          pendingInvitations: row.pendingInvitations,
          activeMachines: row.activeMachines,
          lastAuditAt: row.lastAuditAt,
        })),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total: count.total,
          pages: Math.ceil(count.total / PAGE_SIZE),
        },
      };
      return secureJsonResponse(directory);
    } catch (error: unknown) {
      reportError('admin.organization_directory_failed', error);
      return secureJsonResponse({ error: 'Organization directory unavailable' }, 503);
    }
  });
}
