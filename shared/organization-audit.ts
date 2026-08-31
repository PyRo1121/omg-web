/** Private Svelte-to-Worker audit query. References remain server-only. */
export interface OrganizationAuditRequest {
  readonly organizationId: string;
  readonly userId: string;
  readonly filter: OrganizationAuditFilter;
  readonly page: number;
}

export type OrganizationAuditFilter = 'all' | 'invitations' | 'members';
type OrganizationAuditRole = 'owner' | 'admin' | 'member';
type OrganizationAuditTier = 'free' | 'pro' | 'team' | 'enterprise' | null;
export type OrganizationAuditAction =
  | 'organization.invitation.accepted'
  | 'organization.invitation.created'
  | 'organization.invitation.delivery_failed'
  | 'organization.invitation.rejected'
  | 'organization.invitation.resent'
  | 'organization.invitation.revoked'
  | 'organization.member.ownership_transferred'
  | 'organization.member.removed'
  | 'organization.member.role_changed';

/** Browser-safe, bounded organization audit projection. */
export interface OrganizationAuditResponse {
  readonly organization: {
    readonly name: string;
    readonly role: OrganizationAuditRole;
    readonly status: 'active' | 'restricted';
    readonly tier: OrganizationAuditTier;
  };
  readonly filter: OrganizationAuditFilter;
  readonly page: number;
  readonly pageSize: 25;
  readonly hasMore: boolean;
  readonly events: ReadonlyArray<{
    readonly action: OrganizationAuditAction;
    readonly role: OrganizationAuditRole | null;
    readonly occurredAt: string;
  }>;
}
