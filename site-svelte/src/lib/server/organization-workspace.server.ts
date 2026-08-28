import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { BoundedFormRejected, readBoundedUrlEncodedForm } from './bounded-form.server';
import type { AuthEnvironment } from './auth.server';

const MEMBERSHIP_QUERY = `SELECT
  organization.billing_customer_id AS billingCustomerId,
  organization.name,
  organization.slug,
  member.role,
  license.tier,
  license.status,
  license.max_seats AS maxSeats,
  (SELECT COUNT(*) FROM auth_member AS seat WHERE seat.organization_id = organization.id) AS usedSeats
FROM auth_member AS member
JOIN auth_organization AS organization ON organization.id = member.organization_id
LEFT JOIN licenses AS license ON license.customer_id = organization.billing_customer_id
WHERE member.user_id = ?
ORDER BY member.created_at
LIMIT 2`;
const ENTITLEMENT_QUERY = `SELECT
  customer.id AS customerId,
  license.tier,
  license.status,
  license.max_seats AS maxSeats
FROM customers AS customer
JOIN licenses AS license ON license.customer_id = customer.id
WHERE lower(customer.email) = ?
LIMIT 2`;
const USER_MEMBERSHIP_QUERY = 'SELECT id FROM auth_member WHERE user_id = ? LIMIT 1';
const ORGANIZATION_SLUG_QUERY = 'SELECT id FROM auth_organization WHERE slug = ? LIMIT 1';
const INSERT_ORGANIZATION_QUERY = `INSERT INTO auth_organization
  (id, name, slug, created_at, billing_customer_id)
VALUES (?, ?, ?, ?, ?)`;
const INSERT_OWNER_QUERY = `INSERT INTO auth_member
  (id, organization_id, user_id, role, created_at)
VALUES (?, ?, ?, 'owner', ?)`;
const SET_ACTIVE_ORGANIZATION_QUERY = `UPDATE auth_session
SET active_organization_id = ?, updated_at = ?
WHERE user_id = ? AND token = ?`;
const MEMBERSHIP_LIMIT_QUERY = `SELECT license.max_seats AS maxSeats
FROM auth_organization AS organization
JOIN licenses AS license ON license.customer_id = organization.billing_customer_id
WHERE organization.id = ?
  AND license.status = 'active'
  AND license.tier IN ('team', 'enterprise')`;

const ORGANIZATION_FORM_LIMIT = 8 * 1024;
const OrganizationName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMinLength(2),
  Schema.isMaxLength(80)
);
const OrganizationSlug = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(48),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
);
const Tier = Schema.Literals(['free', 'pro', 'team', 'enterprise']);
const PaidTier = Schema.Literals(['team', 'enterprise']);
const Role = Schema.Literals(['owner', 'admin', 'member']);
const PositiveSeatCount = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1));
const SeatUsage = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const LicenseStatus = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32));
const OrganizationBootstrapSchema = Schema.Struct({
  name: OrganizationName,
  slug: OrganizationSlug,
});
export type OrganizationBootstrapInput = Schema.Schema.Type<typeof OrganizationBootstrapSchema>;
const OrganizationReferenceRowSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});
const EntitlementRowSchema = Schema.Struct({
  customerId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  maxSeats: Schema.NullOr(PositiveSeatCount),
  status: LicenseStatus,
  tier: Tier,
});
const MembershipLimitRowSchema = Schema.Struct({ maxSeats: PositiveSeatCount });
const MembershipRowSchema = Schema.Struct({
  billingCustomerId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  maxSeats: Schema.NullOr(PositiveSeatCount),
  name: OrganizationName,
  role: Role,
  slug: OrganizationSlug,
  status: Schema.NullOr(LicenseStatus),
  tier: Schema.NullOr(Tier),
  usedSeats: SeatUsage,
});
type OrganizationBoundaryInput = Schema.Top['Encoded'];
type TierName = Schema.Schema.Type<typeof Tier>;
type PaidTierName = Schema.Schema.Type<typeof PaidTier>;
type OrganizationRole = Schema.Schema.Type<typeof Role>;

export interface OrganizationWorkspaceIdentity {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly sessionToken: string;
}

export interface OrganizationWorkspaceBoundary {
  readonly entitlementRows: OrganizationBoundaryInput;
  readonly membershipRows: OrganizationBoundaryInput;
}

export interface OrganizationSummary {
  readonly maxSeats: number | null;
  readonly name: string;
  readonly role: OrganizationRole;
  readonly slug: string;
  readonly tier: TierName | null;
  readonly usedSeats: number;
}

export type OrganizationWorkspaceState =
  | { readonly status: 'verification-required' }
  | { readonly status: 'individual'; readonly tier: 'free' | 'pro' | null }
  | { readonly status: 'eligible'; readonly tier: PaidTierName; readonly maxSeats: number }
  | {
      readonly status: 'active' | 'restricted';
      readonly organization: OrganizationSummary;
    }
  | { readonly status: 'unavailable' };

export class OrganizationBootstrapInvalid extends Error {
  readonly _tag = 'OrganizationBootstrapInvalid';
  constructor(readonly status: 400 | 413) {
    super('Organization workspace details are invalid');
    this.name = 'OrganizationBootstrapInvalid';
  }
}

export class OrganizationBootstrapForbidden extends Error {
  readonly _tag = 'OrganizationBootstrapForbidden';
  constructor() {
    super('An active Team or Enterprise plan is required');
    this.name = 'OrganizationBootstrapForbidden';
  }
}

export class OrganizationBootstrapExisting extends Error {
  readonly _tag = 'OrganizationBootstrapExisting';
  constructor() {
    super('An organization membership already exists');
    this.name = 'OrganizationBootstrapExisting';
  }
}

export class OrganizationBootstrapConflict extends Error {
  readonly _tag = 'OrganizationBootstrapConflict';
  constructor() {
    super('The organization could not be created with these details');
    this.name = 'OrganizationBootstrapConflict';
  }
}

export class OrganizationBootstrapUnavailable extends Error {
  readonly _tag = 'OrganizationBootstrapUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Organization storage is unavailable');
    this.name = 'OrganizationBootstrapUnavailable';
  }
}

export class OrganizationMembershipLimitUnavailable extends Error {
  readonly _tag = 'OrganizationMembershipLimitUnavailable';
  constructor(override readonly cause?: unknown) {
    super('Organization membership limit is unavailable');
    this.name = 'OrganizationMembershipLimitUnavailable';
  }
}

function decodeEntitlementRow(
  rows: OrganizationBoundaryInput
): Schema.Schema.Type<typeof EntitlementRowSchema> | null | undefined {
  const decoded = Schema.decodeUnknownExit(Schema.Array(EntitlementRowSchema))(rows);
  if (Exit.isFailure(decoded) || decoded.value.length > 1) {
    return undefined;
  }
  return decoded.value[0] ?? null;
}

function decodeMembershipRow(
  rows: OrganizationBoundaryInput
): Schema.Schema.Type<typeof MembershipRowSchema> | null | undefined {
  const decoded = Schema.decodeUnknownExit(Schema.Array(MembershipRowSchema))(rows);
  if (Exit.isFailure(decoded) || decoded.value.length > 1) {
    return undefined;
  }
  return decoded.value[0] ?? null;
}

function publicOrganization(
  row: Schema.Schema.Type<typeof MembershipRowSchema>
): OrganizationSummary {
  return {
    maxSeats: row.maxSeats,
    name: row.name,
    role: row.role,
    slug: row.slug,
    tier: row.tier,
    usedSeats: row.usedSeats,
  };
}

export function resolveOrganizationWorkspaceState(
  identity: OrganizationWorkspaceIdentity,
  boundary: OrganizationWorkspaceBoundary
): OrganizationWorkspaceState {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }

  const membership = decodeMembershipRow(boundary.membershipRows);
  if (membership === undefined) {
    return { status: 'unavailable' };
  }
  if (membership !== null) {
    const organization = publicOrganization(membership);
    const isPaidTier = membership.tier === 'team' || membership.tier === 'enterprise';
    const isWithinSeatLimit =
      organization.maxSeats !== null && membership.usedSeats <= organization.maxSeats;
    return {
      status:
        membership.status === 'active' && isPaidTier && isWithinSeatLimit ? 'active' : 'restricted',
      organization,
    };
  }

  const entitlement = decodeEntitlementRow(boundary.entitlementRows);
  if (entitlement === undefined) {
    return { status: 'unavailable' };
  }
  if (entitlement === null) {
    return { status: 'individual', tier: null };
  }
  if (entitlement.tier === 'free' || entitlement.tier === 'pro') {
    return { status: 'individual', tier: entitlement.tier };
  }
  if (entitlement.status !== 'active' || entitlement.maxSeats === null) {
    return { status: 'unavailable' };
  }
  return { status: 'eligible', tier: entitlement.tier, maxSeats: entitlement.maxSeats };
}

export async function loadOrganizationWorkspaceState(
  identity: OrganizationWorkspaceIdentity,
  database: AuthEnvironment['DB']
): Promise<OrganizationWorkspaceState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  try {
    const [memberships, entitlements] = await Promise.all([
      database.prepare(MEMBERSHIP_QUERY).bind(identity.id).all(),
      database.prepare(ENTITLEMENT_QUERY).bind(identity.email.toLowerCase()).all(),
    ]);
    return resolveOrganizationWorkspaceState(identity, {
      membershipRows: memberships.results,
      entitlementRows: entitlements.results,
    });
  } catch {
    return { status: 'unavailable' };
  }
}

export async function loadOrganizationMembershipLimit(
  database: AuthEnvironment['DB'],
  organizationId: string
): Promise<number> {
  try {
    const row = await database.prepare(MEMBERSHIP_LIMIT_QUERY).bind(organizationId).first();
    const decoded = Schema.decodeUnknownExit(MembershipLimitRowSchema)(row);
    if (Exit.isFailure(decoded)) {
      throw new OrganizationMembershipLimitUnavailable();
    }
    return decoded.value.maxSeats;
  } catch (cause) {
    if (cause instanceof OrganizationMembershipLimitUnavailable) {
      throw cause;
    }
    throw new OrganizationMembershipLimitUnavailable(cause);
  }
}

export async function bootstrapOrganization(
  identity: OrganizationWorkspaceIdentity,
  database: AuthEnvironment['DB'],
  input: OrganizationBootstrapInput
): Promise<void> {
  if (!identity.emailVerified) {
    throw new OrganizationBootstrapForbidden();
  }

  let membershipRow: OrganizationBoundaryInput;
  let slugRow: OrganizationBoundaryInput;
  let entitlementRows: OrganizationBoundaryInput;
  try {
    const [membership, slug, entitlements] = await Promise.all([
      database.prepare(USER_MEMBERSHIP_QUERY).bind(identity.id).first(),
      database.prepare(ORGANIZATION_SLUG_QUERY).bind(input.slug).first(),
      database.prepare(ENTITLEMENT_QUERY).bind(identity.email.toLowerCase()).all(),
    ]);
    membershipRow = membership;
    slugRow = slug;
    entitlementRows = entitlements.results;
  } catch (cause) {
    throw new OrganizationBootstrapUnavailable(cause);
  }

  const membership = Schema.decodeUnknownExit(Schema.NullOr(OrganizationReferenceRowSchema))(
    membershipRow
  );
  const slug = Schema.decodeUnknownExit(Schema.NullOr(OrganizationReferenceRowSchema))(slugRow);
  const entitlement = Schema.decodeUnknownExit(Schema.Array(EntitlementRowSchema))(entitlementRows);
  if (Exit.isFailure(membership) || Exit.isFailure(slug) || Exit.isFailure(entitlement)) {
    throw new OrganizationBootstrapUnavailable();
  }
  if (membership.value !== null) {
    throw new OrganizationBootstrapExisting();
  }
  if (slug.value !== null) {
    throw new OrganizationBootstrapConflict();
  }
  const [paidEntitlement] = entitlement.value;
  if (
    entitlement.value.length !== 1 ||
    paidEntitlement === undefined ||
    paidEntitlement.status !== 'active' ||
    paidEntitlement.maxSeats === null ||
    (paidEntitlement.tier !== 'team' && paidEntitlement.tier !== 'enterprise')
  ) {
    throw new OrganizationBootstrapForbidden();
  }

  const organizationId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    await database.batch([
      database
        .prepare(INSERT_ORGANIZATION_QUERY)
        .bind(organizationId, input.name, input.slug, createdAt, paidEntitlement.customerId),
      database.prepare(INSERT_OWNER_QUERY).bind(memberId, organizationId, identity.id, createdAt),
      database
        .prepare(SET_ACTIVE_ORGANIZATION_QUERY)
        .bind(organizationId, createdAt, identity.id, identity.sessionToken),
    ]);
  } catch (cause) {
    throw new OrganizationBootstrapUnavailable(cause);
  }
}

export function readOrganizationBootstrapForm(
  request: Request
): Effect.Effect<
  Schema.Schema.Type<typeof OrganizationBootstrapSchema>,
  OrganizationBootstrapInvalid
> {
  return readBoundedUrlEncodedForm(request, ORGANIZATION_FORM_LIMIT).pipe(
    Effect.mapError(
      cause =>
        new OrganizationBootstrapInvalid(cause instanceof BoundedFormRejected ? cause.status : 400)
    ),
    Effect.flatMap(params => {
      const names = params.getAll('name');
      const slugs = params.getAll('slug');
      if (names.length !== 1 || slugs.length !== 1) {
        return Effect.fail(new OrganizationBootstrapInvalid(400));
      }
      return Schema.decodeUnknownEffect(OrganizationBootstrapSchema)({
        name: names[0]?.trim(),
        slug: slugs[0]?.trim().toLowerCase(),
      }).pipe(Effect.mapError(() => new OrganizationBootstrapInvalid(400)));
    })
  );
}
