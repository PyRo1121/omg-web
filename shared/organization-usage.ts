/** Private Svelte-to-Worker organization context. These references never enter page data. */
export interface OrganizationUsageRequest {
  readonly organizationId: string;
  readonly userId: string;
}

export type OrganizationUsageRole = 'owner' | 'admin' | 'member';
export type OrganizationUsageTier = 'free' | 'pro' | 'team' | 'enterprise' | null;

interface OrganizationUsageTotals {
  readonly commands: number;
  readonly packagesInstalled: number;
  readonly runtimeSwitches: number;
  readonly timeSavedMs: number;
}

export interface OrganizationFleetSummary {
  readonly activeMachines: number;
  readonly seenWithinSevenDays: number;
  readonly notSeenWithinSevenDays: number;
  readonly versions: ReadonlyArray<{
    readonly version: string | null;
    readonly machines: number;
  }>;
  readonly hasMoreVersions: boolean;
}

/** Browser-safe organization usage and fleet projection. */
export interface OrganizationUsageResponse {
  readonly organization: {
    readonly name: string;
    readonly role: OrganizationUsageRole;
    readonly status: 'active' | 'restricted';
    readonly tier: OrganizationUsageTier;
  };
  readonly seats: {
    readonly used: number;
    readonly limit: number | null;
  };
  readonly windowDays: 30;
  readonly members: ReadonlyArray<{
    readonly email: string;
    readonly name: string;
    readonly role: OrganizationUsageRole;
    readonly attributedMachines: number;
    readonly usage: OrganizationUsageTotals;
  }>;
  readonly hasMoreMembers: boolean;
  readonly unattributed: {
    readonly machines: number;
    readonly usage: OrganizationUsageTotals;
  };
  readonly fleet: OrganizationFleetSummary;
}
