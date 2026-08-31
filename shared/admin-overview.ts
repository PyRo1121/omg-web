/** One exact count in an operator-overview breakdown. */
export interface AdminBreakdownItem {
  readonly label: string;
  readonly count: number;
}

/** One day of recorded CLI activity. */
export interface AdminDailyActivity {
  readonly date: string;
  readonly activeUsers: number;
  readonly commands: number;
}

/** One day of account creation totals. */
interface AdminRecentSignup {
  readonly date: string;
  readonly count: number;
}

/** Browser-safe audit activity with customer, network, and resource identifiers removed. */
interface AdminActivitySummary {
  readonly action: string;
  readonly resourceType: string | null;
  readonly createdAt: string;
}

/** High-signal, browser-safe projection of the private admin APIs. */
export interface AdminOverview {
  readonly totalUsers: number;
  readonly activeLicenses: number;
  readonly activeMachines: number;
  readonly totalInstalls: number;
  readonly commands30d: number;
  readonly packagesInstalled30d: number;
  readonly searches30d: number;
  readonly timeSavedMs30d: number;
  readonly commandSuccess24h: number;
  readonly commandFailure24h: number;
  readonly dailyActivity: ReadonlyArray<AdminDailyActivity>;
  readonly recentSignups: ReadonlyArray<AdminRecentSignup>;
  readonly fleetVersions: ReadonlyArray<AdminBreakdownItem>;
  readonly installsByPlatform: ReadonlyArray<AdminBreakdownItem>;
  readonly tiers: ReadonlyArray<AdminBreakdownItem>;
  readonly subscriptions: ReadonlyArray<AdminBreakdownItem>;
  readonly activity: ReadonlyArray<AdminActivitySummary>;
}
