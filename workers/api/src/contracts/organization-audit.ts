import * as Schema from 'effect/Schema';
import { DisplayText, PrivateReference, Role } from './primitives';

const OrganizationAuditFilterSchema = Schema.Literal('all', 'invitations', 'members');
const OrganizationAuditRoleSchema = Role;
const OrganizationAuditActionSchema = Schema.Literal(
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

export const OrganizationAuditRequestSchema = Schema.Struct({
  organizationId: PrivateReference,
  userId: PrivateReference,
  filter: OrganizationAuditFilterSchema,
  page: Schema.Int.pipe(Schema.between(1, 40)),
});

export const OrganizationAuditResponseSchema = Schema.Struct({
  organization: Schema.Struct({
    name: DisplayText,
    role: OrganizationAuditRoleSchema,
    status: Schema.Literal('active', 'restricted'),
    tier: Schema.NullOr(Schema.Literal('free', 'pro', 'team', 'enterprise')),
  }),
  filter: OrganizationAuditFilterSchema,
  page: Schema.Int.pipe(Schema.between(1, 40)),
  pageSize: Schema.Literal(25),
  hasMore: Schema.Boolean,
  events: Schema.Array(
    Schema.Struct({
      action: OrganizationAuditActionSchema,
      role: Schema.NullOr(OrganizationAuditRoleSchema),
      occurredAt: Schema.String.pipe(Schema.minLength(20), Schema.maxLength(32)),
    })
  ).pipe(Schema.maxItems(25)),
});

export const OrganizationAuditContextRowSchema = Schema.Struct({
  billingCustomerId: PrivateReference,
  name: DisplayText,
  role: OrganizationAuditRoleSchema,
  tier: Schema.NullOr(Schema.Literal('free', 'pro', 'team', 'enterprise')),
  licenseStatus: Schema.NullOr(Schema.String.pipe(Schema.maxLength(64))),
  maxSeats: Schema.NullOr(Schema.Number),
  usedSeats: Schema.Number,
});

export const OrganizationAuditRowSchema = Schema.Struct({
  action: OrganizationAuditActionSchema,
  metadata: Schema.NullOr(Schema.String.pipe(Schema.maxLength(1024))),
  occurredAt: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
});

export const OrganizationAuditMetadataSchema = Schema.Struct({
  role: OrganizationAuditRoleSchema,
});
