/** Browser-safe customer row for the private admin directory. */
export interface AdminCustomerSummary {
  readonly email: string;
  readonly company: string | null;
  readonly createdAt: string | null;
  readonly tier: string;
  readonly status: string;
  readonly activeMachines: number;
  readonly totalCommands: number;
  readonly lastActiveDate: string | null;
  readonly activeDays30d: number;
  readonly engagementScore: number;
  readonly lifecycleStage: string;
}

/** Pagination metadata for a bounded customer directory page. */
export interface AdminCustomerPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pages: number;
}

/** One bounded customer directory response. */
export interface AdminCustomerDirectory {
  readonly customers: ReadonlyArray<AdminCustomerSummary>;
  readonly pagination: AdminCustomerPagination;
}

/** Descriptive machine metadata that is safe to show to an administrator. */
export interface AdminCustomerMachine {
  readonly hostname: string | null;
  readonly operatingSystem: string | null;
  readonly architecture: string | null;
  readonly omgVersion: string | null;
  readonly active: boolean;
  readonly firstSeenAt: string | null;
  readonly lastSeenAt: string | null;
}

/** Exact daily usage without license or machine identifiers. */
export interface AdminCustomerUsageDay {
  readonly date: string;
  readonly commands: number;
  readonly packagesInstalled: number;
  readonly packagesSearched: number;
  readonly runtimesSwitched: number;
  readonly sbomsGenerated: number;
  readonly vulnerabilitiesFound: number;
  readonly timeSavedMs: number;
}

/** Browser-safe customer support detail. */
export interface AdminCustomerDetail {
  readonly email: string;
  readonly company: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly tier: string;
  readonly status: string;
  readonly maxSeats: number | null;
  readonly maxMachines: number | null;
  readonly expiresAt: string | null;
  readonly telemetryOptOut: boolean;
  readonly machines: ReadonlyArray<AdminCustomerMachine>;
  readonly usage: ReadonlyArray<AdminCustomerUsageDay>;
}

/** Existing audited customer mutations supported by the retained Worker. */
export interface AdminCustomerLicenseUpdate {
  readonly email: string;
  readonly tier?: 'free' | 'pro' | 'team' | 'enterprise';
  readonly status?: 'active' | 'cancelled' | 'inactive';
}
