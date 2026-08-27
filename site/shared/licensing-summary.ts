/** Browser-safe licensing data projected from the private Worker dashboard. */
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
  readonly expiresAt: string | null;
  readonly subscription: LicensingSubscriptionSummary | null;
}

export type LicensingSummaryState =
  | { readonly status: 'available'; readonly summary: LicensingSummary }
  | { readonly status: 'verification-required' }
  | { readonly status: 'unavailable' };
