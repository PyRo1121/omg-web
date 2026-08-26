export interface DashboardData {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly image: string | null;
    readonly createdAt: string;
  };
  readonly sessions: ReadonlyArray<{
    readonly id: string;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly isCurrent: boolean;
  }>;
  readonly accounts: ReadonlyArray<{
    readonly provider: string;
    readonly accountId: string;
  }>;
}
