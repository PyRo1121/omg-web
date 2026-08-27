/** Browser-safe licensing data projected from the private Worker dashboard. */
export interface LicensingMachineSummary {
  readonly hostname: string | null;
  readonly operatingSystem: string | null;
  readonly architecture: string | null;
  readonly version: string | null;
  readonly lastSeenAt: string;
  readonly firstSeenAt: string;
}

export interface LicensingUsageSummary {
  readonly totalCommands: number;
  readonly packagesInstalled: number;
  readonly runtimeSwitches: number;
  readonly timeSavedMs: number;
  readonly currentStreak: number;
  readonly topPackage: string | null;
  readonly topRuntime: string | null;
}

export interface LicensingSubscriptionSummary {
  readonly status: string;
  readonly periodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
}

export interface LicensingSummary {
  readonly tier: string;
  readonly status: string;
  readonly maxMachines: number;
  readonly activeMachines: number;
  readonly isAdmin: boolean;
  readonly machines: ReadonlyArray<LicensingMachineSummary>;
  readonly expiresAt: string | null;
  readonly subscription: LicensingSubscriptionSummary | null;
  readonly usage: LicensingUsageSummary;
}

export type LicensingSummaryState =
  | { readonly status: 'available'; readonly summary: LicensingSummary }
  | { readonly status: 'verification-required' }
  | { readonly status: 'unavailable' };
