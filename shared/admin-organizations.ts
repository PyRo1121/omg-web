import type { OrganizationAuditAction } from './organization-audit';
import type {
  OrganizationFleetSummary,
  OrganizationUsageRole,
  OrganizationUsageTier,
} from './organization-usage';

export interface AdminOrganizationDirectory {
  readonly organizations: ReadonlyArray<{
    readonly name: string;
    readonly slug: string;
    readonly tier: string;
    readonly status: string;
    readonly seatsUsed: number;
    readonly seatLimit: number | null;
    readonly pendingInvitations: number;
    readonly activeMachines: number;
    readonly lastAuditAt: string | null;
  }>;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: 25;
    readonly total: number;
    readonly pages: number;
  };
}

interface AdminOrganizationUsageTotals {
  readonly commands: number;
  readonly packagesInstalled: number;
  readonly packagesSearched: number;
  readonly runtimeSwitches: number;
  readonly sbomsGenerated: number;
  readonly vulnerabilitiesFound: number;
  readonly timeSavedMs: number;
}

/** One selected organization's bounded browser-safe operator projection. */
export interface AdminOrganizationSupport {
  readonly organization: {
    readonly name: string;
    readonly slug: string;
  };
  readonly entitlement: {
    readonly tier: OrganizationUsageTier;
    readonly licenseStatus: string | null;
    readonly access: 'active' | 'restricted';
  };
  readonly seats: {
    readonly used: number;
    readonly limit: number | null;
  };
  readonly members: ReadonlyArray<{
    readonly name: string;
    readonly email: string;
    readonly role: OrganizationUsageRole;
    readonly joinedAt: string;
  }>;
  readonly hasMoreMembers: boolean;
  readonly invitations: ReadonlyArray<{
    readonly email: string;
    readonly role: 'admin' | 'member';
    readonly status: 'pending' | 'expired';
    readonly expiresAt: string;
  }>;
  readonly hasMoreInvitations: boolean;
  readonly usage: {
    readonly windowDays: 30;
    readonly activeDays: number;
    readonly totals: AdminOrganizationUsageTotals;
  };
  readonly fleet: OrganizationFleetSummary;
  readonly audit: {
    readonly events: ReadonlyArray<{
      readonly action: OrganizationAuditAction;
      readonly role: OrganizationUsageRole | null;
      readonly occurredAt: string;
    }>;
    readonly hasMoreEvents: boolean;
  };
}
