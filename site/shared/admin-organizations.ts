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
