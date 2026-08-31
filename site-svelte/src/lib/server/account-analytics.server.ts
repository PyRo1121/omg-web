import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import {
  loadPrivateWorkerPayload,
  loadUserServiceSession,
  type LicensingSummaryEnvironment,
  type LicensingSummaryError,
  type LicensingSummaryIdentity,
} from './licensing-service.server';
import { reportEffectFailure } from './observability.server';

const ANALYTICS_RESPONSE_LIMIT = 256 * 1024;
const Day = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)))
);
const Dimension = Schema.NullOr(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
);
const Percentile = Schema.NullOr(Schema.Natural.check(Schema.isLessThanOrEqualTo(100)));

const AccountAnalyticsResponseSchema = Schema.Struct({
  usage: Schema.Struct({
    total_commands: Schema.Natural,
    total_packages_installed: Schema.Natural,
    total_packages_searched: Schema.Natural,
    total_runtimes_switched: Schema.Natural,
    total_sbom_generated: Schema.Natural,
    total_vulnerabilities_found: Schema.Natural,
    total_time_saved_ms: Schema.Natural,
    current_streak: Schema.Natural,
    longest_streak: Schema.Natural,
    daily: Schema.Array(
      Schema.Struct({
        date: Day,
        commands_run: Schema.Natural,
        time_saved_ms: Schema.Natural,
      })
    ),
    breakdown: Schema.Struct({
      installed: Schema.Natural,
      searched: Schema.Natural,
      switched: Schema.Natural,
      sbom: Schema.Natural,
      vulns: Schema.Natural,
    }),
  }),
  global_stats: Schema.Struct({
    top_package: Dimension,
    top_runtime: Dimension,
    percentile: Percentile,
  }),
});

interface AccountAnalytics {
  readonly totals: {
    readonly commands: number;
    readonly packagesInstalled: number;
    readonly packagesSearched: number;
    readonly runtimeSwitches: number;
    readonly sbomsGenerated: number;
    readonly vulnerabilitiesFound: number;
    readonly timeSavedMs: number;
  };
  readonly streaks: { readonly current: number; readonly longest: number };
  readonly daily: ReadonlyArray<{
    readonly date: string;
    readonly commands: number;
    readonly timeSavedMs: number;
  }>;
  readonly breakdown: {
    readonly installed: number;
    readonly searched: number;
    readonly switched: number;
    readonly sbom: number;
    readonly vulnerabilities: number;
  };
  readonly dimensions: {
    readonly topPackage: string | null;
    readonly topRuntime: string | null;
    readonly percentile: number | null;
  };
}

type AccountAnalyticsState =
  | { readonly status: 'available'; readonly analytics: AccountAnalytics }
  | { readonly status: 'verification-required' }
  | { readonly status: 'unavailable' };

export type AccountAnalyticsExportFormat = 'csv' | 'json';

interface AccountAnalyticsExport {
  readonly body: string;
  readonly contentType: 'application/json; charset=utf-8' | 'text/csv; charset=utf-8';
  readonly filename: string;
}

/** Load and project only the account analytics fields needed by the browser route. */
export function loadAccountAnalytics(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Effect.Effect<AccountAnalytics, LicensingSummaryError> {
  return Effect.gen(function* () {
    const session = yield* loadUserServiceSession(identity, env);
    const dashboard = yield* loadPrivateWorkerPayload(
      env,
      session,
      '/api/dashboard',
      'account-analytics',
      ANALYTICS_RESPONSE_LIMIT,
      AccountAnalyticsResponseSchema
    );
    return {
      totals: {
        commands: dashboard.usage.total_commands,
        packagesInstalled: dashboard.usage.total_packages_installed,
        packagesSearched: dashboard.usage.total_packages_searched,
        runtimeSwitches: dashboard.usage.total_runtimes_switched,
        sbomsGenerated: dashboard.usage.total_sbom_generated,
        vulnerabilitiesFound: dashboard.usage.total_vulnerabilities_found,
        timeSavedMs: dashboard.usage.total_time_saved_ms,
      },
      streaks: {
        current: dashboard.usage.current_streak,
        longest: dashboard.usage.longest_streak,
      },
      daily: dashboard.usage.daily.map(day => ({
        date: day.date,
        commands: day.commands_run,
        timeSavedMs: day.time_saved_ms,
      })),
      breakdown: {
        installed: dashboard.usage.breakdown.installed,
        searched: dashboard.usage.breakdown.searched,
        switched: dashboard.usage.breakdown.switched,
        sbom: dashboard.usage.breakdown.sbom,
        vulnerabilities: dashboard.usage.breakdown.vulns,
      },
      dimensions: {
        topPackage: dashboard.global_stats.top_package,
        topRuntime: dashboard.global_stats.top_runtime,
        percentile: dashboard.global_stats.percentile,
      },
    };
  });
}

/** Ground analytics into a serializable route state with localized degradation. */
export async function loadAccountAnalyticsState(
  identity: LicensingSummaryIdentity,
  env: LicensingSummaryEnvironment
): Promise<AccountAnalyticsState> {
  if (!identity.emailVerified) {
    return { status: 'verification-required' };
  }
  const exit = await Effect.runPromiseExit(loadAccountAnalytics(identity, env));
  if (Exit.isSuccess(exit)) {
    return { status: 'available', analytics: exit.value };
  }
  reportEffectFailure('account.analytics_unavailable', exit.cause);
  return { status: 'unavailable' };
}

/** Serialize the already-safe analytics projection at the download boundary. */
export function createAccountAnalyticsExport(
  analytics: AccountAnalytics,
  format: AccountAnalyticsExportFormat,
  exportedAt: Date
): AccountAnalyticsExport {
  const date = exportedAt.toISOString().slice(0, 10);
  if (format === 'json') {
    return {
      body: JSON.stringify(analytics, null, 2),
      contentType: 'application/json; charset=utf-8',
      filename: `omg-usage-${date}.json`,
    };
  }
  const rows = [
    'Date,Commands,Time saved (ms)',
    ...analytics.daily.map(day => `${day.date},${day.commands},${day.timeSavedMs}`),
  ];
  return {
    body: rows.join('\n'),
    contentType: 'text/csv; charset=utf-8',
    filename: `omg-usage-${date}.csv`,
  };
}
