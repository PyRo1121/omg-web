export const ADMIN_CUSTOMER_TIERS: readonly ['free', 'pro', 'team', 'enterprise'] = [
  'free',
  'pro',
  'team',
  'enterprise',
];
export const ADMIN_CUSTOMER_STATUSES: readonly ['active', 'cancelled', 'inactive'] = [
  'active',
  'cancelled',
  'inactive',
];

export type AdminCustomerTier = (typeof ADMIN_CUSTOMER_TIERS)[number];
export type AdminCustomerStatus = (typeof ADMIN_CUSTOMER_STATUSES)[number];

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

/** One computed CRM health snapshot without its customer database key. */
export interface AdminCustomerHealth {
  readonly overallScore: number;
  readonly engagementScore: number;
  readonly activationScore: number;
  readonly growthScore: number;
  readonly riskScore: number;
  readonly lifecycleStage: string;
  readonly updatedAt: string | null;
}

/** One browser-safe CRM note without note, customer, or author database keys. */
export interface AdminCustomerNote {
  readonly content: string;
  readonly noteType: string;
  readonly pinned: boolean;
  readonly authorEmail: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

/** One browser-safe assigned CRM tag. Names are unique in the retained catalog. */
export interface AdminCustomerTag {
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

/** One browser-safe tag catalog entry with a grounded assignment count. */
export interface AdminCustomerCatalogTag extends AdminCustomerTag {
  readonly usageCount: number;
}

export type AdminCustomerHealthState =
  | { readonly kind: 'available'; readonly value: AdminCustomerHealth }
  | { readonly kind: 'empty' }
  | { readonly kind: 'unavailable' };

export type AdminCustomerCollectionState<T> =
  | { readonly kind: 'available'; readonly values: ReadonlyArray<T> }
  | { readonly kind: 'unavailable' };

/** Localized support capability states for one selected customer. */
export interface AdminCustomerSupport {
  readonly health: AdminCustomerHealthState;
  readonly notes: AdminCustomerCollectionState<AdminCustomerNote>;
  readonly assignedTags: AdminCustomerCollectionState<AdminCustomerTag>;
  readonly tagCatalog: AdminCustomerCollectionState<AdminCustomerCatalogTag>;
}

/** One selected customer's complete browser-safe operator workspace. */
export interface AdminCustomerWorkspace {
  readonly detail: AdminCustomerDetail;
  readonly support: AdminCustomerSupport;
}

/** Existing audited customer mutations supported by the retained Worker. */
export interface AdminCustomerLicenseUpdate {
  readonly email: string;
  readonly tier?: AdminCustomerTier;
  readonly status?: AdminCustomerStatus;
}
