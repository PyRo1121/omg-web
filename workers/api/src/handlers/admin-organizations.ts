import * as Schema from 'effect/Schema';
import type {
  AdminOrganizationDirectory,
  AdminOrganizationSupport,
} from '../../../../shared/admin-organizations';
import { D1Number } from '../../../../shared/d1-rows';
import type { Env } from '../api';
import { reportError } from '../observability';
import { secureJsonResponse, withAdminQuery } from './admin';

const PAGE_SIZE = 25;
const MAX_MEMBER_ROWS = 100;
const MAX_INVITATION_ROWS = 100;
const MAX_VERSION_ROWS = 50;
const MAX_AUDIT_ROWS = 25;
const OrganizationSlug = Schema.String.pipe(
  Schema.minLength(3),
  Schema.maxLength(48),
  Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
);
const DisplayText = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256));
const PrivateReference = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256));
const NormalizedEmail = Schema.String.pipe(
  Schema.minLength(3),
  Schema.maxLength(320),
  Schema.pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u),
  Schema.filter(value => value === value.trim() && value === value.toLowerCase())
);
const Role = Schema.Literal('owner', 'admin', 'member');
const InvitationRole = Schema.Literal('admin', 'member');
const Tier = Schema.NullOr(Schema.Literal('free', 'pro', 'team', 'enterprise'));
const AuditAction = Schema.Literal(
  'organization.invitation.accepted',
  'organization.invitation.created',
  'organization.invitation.delivery_failed',
  'organization.invitation.rejected',
  'organization.invitation.resent',
  'organization.invitation.revoked',
  'organization.member.ownership_transferred',
  'organization.member.removed',
  'organization.member.role_changed'
);
const TimestampSource = Schema.Union(Schema.Number, Schema.String.pipe(Schema.maxLength(64)));
const UsageTotals = Schema.Struct({
  commands: Schema.NonNegativeInt,
  packagesInstalled: Schema.NonNegativeInt,
  packagesSearched: Schema.NonNegativeInt,
  runtimeSwitches: Schema.NonNegativeInt,
  sbomsGenerated: Schema.NonNegativeInt,
  vulnerabilitiesFound: Schema.NonNegativeInt,
  timeSavedMs: Schema.NonNegativeInt,
});
const DirectoryRowSchema = Schema.Struct({
  name: DisplayText,
  slug: OrganizationSlug,
  tier: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  status: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  seatsUsed: D1Number,
  seatLimit: Schema.NullOr(Schema.Number),
  pendingInvitations: D1Number,
  activeMachines: D1Number,
  lastAuditAt: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
});
const CountRowSchema = Schema.Struct({ total: D1Number });
const SupportQuerySchema = Schema.Struct({ slug: OrganizationSlug });
const SupportContextRowSchema = Schema.Struct({
  organizationId: PrivateReference,
  billingCustomerId: PrivateReference,
  licenseId: PrivateReference,
  name: DisplayText,
  slug: OrganizationSlug,
  tier: Tier,
  licenseStatus: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  maxSeats: Schema.NullOr(Schema.Number),
  usedSeats: D1Number,
});
const SupportMemberRowSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.maxLength(256)),
  email: NormalizedEmail,
  role: Role,
  joinedAt: TimestampSource,
});
const SupportInvitationRowSchema = Schema.Struct({
  email: NormalizedEmail,
  role: InvitationRole,
  expiresAt: TimestampSource,
});
const SupportUsageRowSchema = Schema.Struct({
  activeDays: D1Number,
  commands: D1Number,
  packagesInstalled: D1Number,
  packagesSearched: D1Number,
  runtimeSwitches: D1Number,
  sbomsGenerated: D1Number,
  vulnerabilitiesFound: D1Number,
  timeSavedMs: D1Number,
});
const SupportFleetRowSchema = Schema.Struct({
  activeMachines: D1Number,
  seenWithinSevenDays: D1Number,
  notSeenWithinSevenDays: D1Number,
});
const SupportVersionRowSchema = Schema.Struct({
  version: Schema.NullOr(Schema.String.pipe(Schema.maxLength(256))),
  machines: D1Number,
});
const SupportAuditRowSchema = Schema.Struct({
  action: AuditAction,
  metadata: Schema.NullOr(Schema.String.pipe(Schema.maxLength(1024))),
  occurredAt: TimestampSource,
});
const SupportAuditMetadataSchema = Schema.Struct({ role: Role });
const SupportResponseSchema = Schema.Struct({
  organization: Schema.Struct({ name: DisplayText, slug: OrganizationSlug }),
  entitlement: Schema.Struct({
    tier: Tier,
    licenseStatus: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
    access: Schema.Literal('active', 'restricted'),
  }),
  seats: Schema.Struct({
    used: Schema.NonNegativeInt,
    limit: Schema.NullOr(Schema.NonNegativeInt.pipe(Schema.greaterThanOrEqualTo(1))),
  }),
  members: Schema.Array(
    Schema.Struct({
      name: DisplayText,
      email: NormalizedEmail,
      role: Role,
      joinedAt: Schema.String.pipe(Schema.minLength(20), Schema.maxLength(32)),
    })
  ).pipe(Schema.maxItems(MAX_MEMBER_ROWS)),
  hasMoreMembers: Schema.Boolean,
  invitations: Schema.Array(
    Schema.Struct({
      email: NormalizedEmail,
      role: InvitationRole,
      status: Schema.Literal('pending', 'expired'),
      expiresAt: Schema.String.pipe(Schema.minLength(20), Schema.maxLength(32)),
    })
  ).pipe(Schema.maxItems(MAX_INVITATION_ROWS)),
  hasMoreInvitations: Schema.Boolean,
  usage: Schema.Struct({
    windowDays: Schema.Literal(30),
    activeDays: Schema.NonNegativeInt,
    totals: UsageTotals,
  }),
  fleet: Schema.Struct({
    activeMachines: Schema.NonNegativeInt,
    seenWithinSevenDays: Schema.NonNegativeInt,
    notSeenWithinSevenDays: Schema.NonNegativeInt,
    versions: Schema.Array(
      Schema.Struct({
        version: Schema.NullOr(DisplayText),
        machines: Schema.NonNegativeInt,
      })
    ).pipe(Schema.maxItems(MAX_VERSION_ROWS)),
    hasMoreVersions: Schema.Boolean,
  }),
  audit: Schema.Struct({
    events: Schema.Array(
      Schema.Struct({
        action: AuditAction,
        role: Schema.NullOr(Role),
        occurredAt: Schema.String.pipe(Schema.minLength(20), Schema.maxLength(32)),
      })
    ).pipe(Schema.maxItems(MAX_AUDIT_ROWS)),
    hasMoreEvents: Schema.Boolean,
  }),
});

function oneParameter(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length <= 1 ? (values[0] ?? null) : null;
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function timestampToIso(value: number | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid organization support timestamp');
  }
  return date.toISOString();
}

function auditRole(metadata: string | null): 'owner' | 'admin' | 'member' | null {
  return metadata === null
    ? null
    : Schema.decodeUnknownSync(Schema.parseJson(SupportAuditMetadataSchema))(metadata).role;
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

/** Return one bounded support workspace selected only by its browser-safe slug. */
export async function handleAdminOrganizationSupport(
  request: Request,
  env: Env
): Promise<Response> {
  return withAdminQuery(request, env, async (_context, url) => {
    const keys = [...url.searchParams.keys()];
    const rawSlug = oneParameter(url, 'slug');
    if (keys.some(key => key !== 'slug') || rawSlug === null) {
      return secureJsonResponse({ error: 'Invalid organization support query' }, 400);
    }

    let slug: string;
    try {
      slug = Schema.decodeUnknownSync(SupportQuerySchema)({ slug: rawSlug }).slug;
    } catch {
      return secureJsonResponse({ error: 'Invalid organization support query' }, 400);
    }

    try {
      const contextResult = await env.DB.prepare(
        `SELECT
          organization.id AS organizationId,
          organization.billing_customer_id AS billingCustomerId,
          license.id AS licenseId,
          organization.name,
          organization.slug,
          license.tier,
          license.status AS licenseStatus,
          license.max_seats AS maxSeats,
          (SELECT COUNT(*) FROM auth_member AS seat
            WHERE seat.organization_id = organization.id) AS usedSeats
        FROM auth_organization AS organization
        JOIN licenses AS license ON license.customer_id = organization.billing_customer_id
        WHERE organization.slug = ?
        LIMIT 2`
      )
        .bind(slug)
        .all();
      const contexts = Schema.decodeUnknownSync(Schema.Array(SupportContextRowSchema))(
        contextResult.results
      );
      if (contexts.length === 0) {
        return secureJsonResponse({ error: 'Organization not found' }, 404);
      }
      if (contexts.length !== 1) {
        throw new Error('Organization support context is not unique');
      }
      const context = contexts[0];
      if (context === undefined) {
        throw new Error('Organization support context is missing');
      }

      const [memberResult, invitationResult, usageValue, fleetValue, versionResult, auditResult] =
        await Promise.all([
          env.DB.prepare(
            `SELECT
              member_user.name,
              lower(member_user.email) AS email,
              member.role,
              member.created_at AS joinedAt
            FROM auth_member AS member
            JOIN auth_user AS member_user ON member_user.id = member.user_id
            WHERE member.organization_id = ?
            ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
              member.created_at,
              member_user.email
            LIMIT ?`
          )
            .bind(context.organizationId, MAX_MEMBER_ROWS + 1)
            .all(),
          env.DB.prepare(
            `SELECT lower(email) AS email, role, expires_at AS expiresAt
            FROM auth_invitation
            WHERE organization_id = ? AND status = 'pending'
            ORDER BY created_at DESC, email
            LIMIT ?`
          )
            .bind(context.organizationId, MAX_INVITATION_ROWS + 1)
            .all(),
          env.DB.prepare(
            `SELECT
              COUNT(*) AS activeDays,
              COALESCE(SUM(commands_run), 0) AS commands,
              COALESCE(SUM(packages_installed), 0) AS packagesInstalled,
              COALESCE(SUM(packages_searched), 0) AS packagesSearched,
              COALESCE(SUM(runtimes_switched), 0) AS runtimeSwitches,
              COALESCE(SUM(sbom_generated), 0) AS sbomsGenerated,
              COALESCE(SUM(vulnerabilities_found), 0) AS vulnerabilitiesFound,
              COALESCE(SUM(time_saved_ms), 0) AS timeSavedMs
            FROM usage_daily
            WHERE license_id = ? AND date >= date('now', '-29 days')`
          )
            .bind(context.licenseId)
            .first(),
          env.DB.prepare(
            `SELECT
              COUNT(*) AS activeMachines,
              COALESCE(SUM(CASE WHEN last_seen_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0)
                AS seenWithinSevenDays,
              COALESCE(SUM(CASE WHEN last_seen_at < datetime('now', '-7 days') THEN 1 ELSE 0 END), 0)
                AS notSeenWithinSevenDays
            FROM machines
            WHERE license_id = ? AND is_active = 1`
          )
            .bind(context.licenseId)
            .first(),
          env.DB.prepare(
            `SELECT NULLIF(trim(omg_version), '') AS version, COUNT(*) AS machines
            FROM machines
            WHERE license_id = ? AND is_active = 1
            GROUP BY NULLIF(trim(omg_version), '')
            ORDER BY version IS NOT NULL, version
            LIMIT ?`
          )
            .bind(context.licenseId, MAX_VERSION_ROWS + 1)
            .all(),
          env.DB.prepare(
            `SELECT action, metadata, created_at AS occurredAt
            FROM audit_log
            WHERE customer_id = ?
              AND resource_type = 'organization'
              AND action LIKE 'organization.%'
            ORDER BY created_at DESC, id DESC
            LIMIT ?`
          )
            .bind(context.billingCustomerId, MAX_AUDIT_ROWS + 1)
            .all(),
        ]);

      const memberRows = Schema.decodeUnknownSync(Schema.Array(SupportMemberRowSchema))(
        memberResult.results
      );
      const invitationRows = Schema.decodeUnknownSync(Schema.Array(SupportInvitationRowSchema))(
        invitationResult.results
      );
      const usage = Schema.decodeUnknownSync(SupportUsageRowSchema)(usageValue);
      const fleet = Schema.decodeUnknownSync(SupportFleetRowSchema)(fleetValue);
      const versionRows = Schema.decodeUnknownSync(Schema.Array(SupportVersionRowSchema))(
        versionResult.results
      );
      const auditRows = Schema.decodeUnknownSync(Schema.Array(SupportAuditRowSchema))(
        auditResult.results
      );
      const seatLimit =
        context.maxSeats !== null && Number.isSafeInteger(context.maxSeats) && context.maxSeats >= 1
          ? context.maxSeats
          : null;
      const paidTier = context.tier === 'team' || context.tier === 'enterprise';
      const access =
        context.licenseStatus === 'active' &&
        paidTier &&
        seatLimit !== null &&
        context.usedSeats <= seatLimit
          ? 'active'
          : 'restricted';
      const payload: AdminOrganizationSupport = {
        organization: { name: context.name.trim(), slug: context.slug },
        entitlement: {
          tier: context.tier,
          licenseStatus: context.licenseStatus,
          access,
        },
        seats: { used: context.usedSeats, limit: seatLimit },
        members: memberRows.slice(0, MAX_MEMBER_ROWS).map(member => ({
          name: member.name.trim() || member.email,
          email: member.email,
          role: member.role,
          joinedAt: timestampToIso(member.joinedAt),
        })),
        hasMoreMembers: memberRows.length > MAX_MEMBER_ROWS,
        invitations: invitationRows.slice(0, MAX_INVITATION_ROWS).map(invitation => {
          const expiresAt = timestampToIso(invitation.expiresAt);
          return {
            email: invitation.email,
            role: invitation.role,
            status: new Date(expiresAt) <= new Date() ? 'expired' : 'pending',
            expiresAt,
          };
        }),
        hasMoreInvitations: invitationRows.length > MAX_INVITATION_ROWS,
        usage: {
          windowDays: 30,
          activeDays: usage.activeDays,
          totals: {
            commands: usage.commands,
            packagesInstalled: usage.packagesInstalled,
            packagesSearched: usage.packagesSearched,
            runtimeSwitches: usage.runtimeSwitches,
            sbomsGenerated: usage.sbomsGenerated,
            vulnerabilitiesFound: usage.vulnerabilitiesFound,
            timeSavedMs: usage.timeSavedMs,
          },
        },
        fleet: {
          activeMachines: fleet.activeMachines,
          seenWithinSevenDays: fleet.seenWithinSevenDays,
          notSeenWithinSevenDays: fleet.notSeenWithinSevenDays,
          versions: versionRows.slice(0, MAX_VERSION_ROWS),
          hasMoreVersions: versionRows.length > MAX_VERSION_ROWS,
        },
        audit: {
          events: auditRows.slice(0, MAX_AUDIT_ROWS).map(row => ({
            action: row.action,
            role: auditRole(row.metadata),
            occurredAt: timestampToIso(row.occurredAt),
          })),
          hasMoreEvents: auditRows.length > MAX_AUDIT_ROWS,
        },
      };
      return secureJsonResponse(Schema.decodeUnknownSync(SupportResponseSchema)(payload));
    } catch (error: unknown) {
      reportError('admin.organization_support_failed', error);
      return secureJsonResponse({ error: 'Organization support unavailable' }, 503);
    }
  });
}
