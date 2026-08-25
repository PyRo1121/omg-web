import * as Schema from 'effect/Schema';
import { Effect } from 'effect';
import {
  LicensingDashboardSchema,
  type LicensingDashboard,
} from '../../../shared/licensing-dashboard';
import { type Env, errorResponse, respondFromEffect, ACHIEVEMENTS, TIER_FEATURES } from '../api';
import { requireSession, type SessionUnauthorizedError } from '../admin-auth';
import { casesHandled } from '../prelude';
import {
  AccountDashboardParseError,
  AchievementUnlockRowSchema,
  AdminFlagRowSchema,
  CommandBreakdownRowSchema,
  DailyUsageRowSchema,
  DashboardLicenseRowSchema,
  DashboardMachineRowSchema,
  InvoiceRowSchema,
  LeaderboardRowSchema,
  StreakDateRowSchema,
  SubscriptionRowSchema,
  UsageStatsRowSchema,
  BetterUsersRowSchema,
  DistinctCountRowSchema,
  TopPackageRowSchema,
  TopRuntimeRowSchema,
  decodeRow,
  decodeRowArray,
} from '../contracts/account-dashboard';

/** The customer has no license row. */
class LicenseNotFoundError extends Error {
  readonly _tag = 'LicenseNotFoundError';
  constructor() {
    super('License not found');
  }
}

/** D1 was unavailable while loading the account dashboard. */
class DashboardStoreUnavailable extends Error {
  readonly _tag = 'DashboardStoreUnavailable';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Dashboard store unavailable during ${operation}`);
  }
}

function queryFirst(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
) {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(sql)
        .bind(...params)
        .first(),
    catch: cause => new DashboardStoreUnavailable(operation, cause),
  });
}

function queryAll(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
) {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(sql)
        .bind(...params)
        .all(),
    catch: cause => new DashboardStoreUnavailable(operation, cause),
  });
}

/**
 * Load the Worker account dashboard for the authenticated customer.
 *
 * @param request - Incoming GET with Bearer token.
 * @param env - Worker bindings.
 * @returns The dashboard payload, or a tagged dashboard error.
 */
function getAccountDashboard(
  request: Request,
  env: Env
): Effect.Effect<
  LicensingDashboard,
  | SessionUnauthorizedError
  | LicenseNotFoundError
  | AccountDashboardParseError
  | DashboardStoreUnavailable
> {
  return Effect.gen(function* () {
    const auth = yield* requireSession(request, env);
    const user = auth.user;

    const adminRow = yield* queryFirst(
      env.DB,
      `SELECT admin FROM customers WHERE id = ?`,
      [user.id],
      'adminFlag'
    );
    const isAdmin =
      adminRow === null
        ? false
        : (yield* decodeRow(AdminFlagRowSchema, 'Admin flag row has an invalid shape', adminRow))
            .admin === 1;

    const licenseRow = yield* queryFirst(
      env.DB,
      `SELECT id, license_key, tier, status, max_seats, max_machines, expires_at
       FROM licenses WHERE customer_id = ?`,
      [user.id],
      'findLicense'
    );
    if (licenseRow === null) {
      return yield* Effect.fail(new LicenseNotFoundError());
    }
    const license = yield* decodeRow(
      DashboardLicenseRowSchema,
      'License row has an invalid shape',
      licenseRow
    );

    const machineResult = yield* queryAll(
      env.DB,
      `SELECT id, machine_id, hostname, os, arch, omg_version, last_seen_at, first_seen_at, is_active
       FROM machines WHERE license_id = ? AND is_active = 1 ORDER BY last_seen_at DESC`,
      [license.id],
      'listMachines'
    );
    const machines = yield* decodeRowArray(
      DashboardMachineRowSchema,
      'Machine rows have an invalid shape',
      machineResult.results
    );

    const usageRow = yield* queryFirst(
      env.DB,
      `SELECT
         SUM(commands_run) as total_commands,
         SUM(packages_installed) as total_packages_installed,
         SUM(packages_searched) as total_packages_searched,
         SUM(runtimes_switched) as total_runtimes_switched,
         SUM(sbom_generated) as total_sbom_generated,
         SUM(vulnerabilities_found) as total_vulnerabilities_found,
         SUM(time_saved_ms) as total_time_saved_ms
       FROM usage_daily
       WHERE license_id = ? AND date >= date('now', '-30 days')`,
      [license.id],
      'usageStats'
    );
    const usageStats =
      usageRow === null
        ? {
            total_commands: 0,
            total_packages_installed: 0,
            total_packages_searched: 0,
            total_runtimes_switched: 0,
            total_sbom_generated: 0,
            total_vulnerabilities_found: 0,
            total_time_saved_ms: 0,
          }
        : yield* decodeRow(UsageStatsRowSchema, 'Usage stats row has an invalid shape', usageRow);

    const dailyResult = yield* queryAll(
      env.DB,
      `SELECT date, commands_run, time_saved_ms
       FROM usage_daily
       WHERE license_id = ? AND date >= date('now', '-14 days')
       ORDER BY date ASC`,
      [license.id],
      'dailyUsage'
    );
    const daily = yield* decodeRowArray(
      DailyUsageRowSchema,
      'Daily usage rows have an invalid shape',
      dailyResult.results
    );

    const unlockResult = yield* queryAll(
      env.DB,
      `SELECT achievement_id, unlocked_at FROM achievements WHERE customer_id = ?`,
      [user.id],
      'achievements'
    );
    const unlocks = yield* decodeRowArray(
      AchievementUnlockRowSchema,
      'Achievement rows have an invalid shape',
      unlockResult.results
    );
    const unlockMap = new Map(unlocks.map(row => [row.achievement_id, row.unlocked_at]));
    const achievements = ACHIEVEMENTS.map(item => ({
      id: item.id,
      emoji: item.emoji,
      name: item.name,
      description: item.description,
      unlocked: unlockMap.has(item.id),
      unlocked_at: unlockMap.get(item.id) ?? null,
    }));

    const streakResult = yield* queryAll(
      env.DB,
      `SELECT date FROM usage_daily
       WHERE license_id = ? AND commands_run > 0
       ORDER BY date DESC`,
      [license.id],
      'streak'
    );
    const streakRows = yield* decodeRowArray(
      StreakDateRowSchema,
      'Streak rows have an invalid shape',
      streakResult.results
    );
    const streakDates = streakRows.map(row => row.date);
    const dayNumbers = streakDates
      .map(date => Date.parse(`${date}T00:00:00Z`) / 86_400_000)
      .filter(Number.isFinite);
    let longestStreak = 0;
    let runLength = 0;
    let previousDay: number | undefined;
    for (const day of dayNumbers) {
      runLength = previousDay !== undefined && previousDay - day === 1 ? runLength + 1 : 1;
      longestStreak = Math.max(longestStreak, runLength);
      previousDay = day;
    }

    const today = Math.floor(Date.now() / 86_400_000);
    const startsNow = dayNumbers[0] === today || dayNumbers[0] === today - 1;
    let currentStreak = startsNow ? 1 : 0;
    if (startsNow) {
      for (let index = 1; index < dayNumbers.length; index += 1) {
        const previous = dayNumbers[index - 1];
        const current = dayNumbers[index];
        if (previous === undefined || current === undefined || previous - current !== 1) {
          break;
        }
        currentStreak += 1;
      }
    }

    const subscriptionRow = yield* queryFirst(
      env.DB,
      `SELECT status, current_period_start, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
      [user.id],
      'subscription'
    );
    const subscription =
      subscriptionRow === null
        ? null
        : yield* decodeRow(
            SubscriptionRowSchema,
            'Subscription row has an invalid shape',
            subscriptionRow
          );

    const invoiceResult = yield* queryAll(
      env.DB,
      `SELECT id, amount_cents, currency, status, invoice_url, invoice_pdf, period_start, period_end, created_at
       FROM invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`,
      [user.id],
      'invoices'
    );
    const invoices = yield* decodeRowArray(
      InvoiceRowSchema,
      'Invoice rows have an invalid shape',
      invoiceResult.results
    );

    const breakdownResult = yield* queryAll(
      env.DB,
      `SELECT packages_installed, packages_searched, runtimes_switched, sbom_generated, vulnerabilities_found
       FROM usage_daily
       WHERE license_id = ? AND date >= date('now', '-30 days')`,
      [license.id],
      'breakdown'
    );
    const breakdownRows = yield* decodeRowArray(
      CommandBreakdownRowSchema,
      'Breakdown rows have an invalid shape',
      breakdownResult.results
    );
    const breakdown = breakdownRows.reduce(
      (acc, row) => ({
        installed: acc.installed + row.packages_installed,
        searched: acc.searched + row.packages_searched,
        switched: acc.switched + row.runtimes_switched,
        sbom: acc.sbom + row.sbom_generated,
        vulns: acc.vulns + row.vulnerabilities_found,
      }),
      { installed: 0, searched: 0, switched: 0, sbom: 0, vulns: 0 }
    );

    const topPackage = yield* queryFirst(
      env.DB,
      `SELECT package_name
       FROM usage_package_daily
       WHERE license_id = ? AND date >= date('now', '-30 days')
       GROUP BY package_name
       ORDER BY SUM(usage_count) DESC, package_name ASC
       LIMIT 1`,
      [license.id],
      'topPackage'
    ).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
      Effect.flatMap(row => {
        if (row === null) {
          return Effect.succeed('ripgrep');
        }
        return decodeRow(TopPackageRowSchema, 'Top package row has an invalid shape', row).pipe(
          Effect.map(decoded => decoded.package_name),
          Effect.catchAll(() => Effect.succeed('ripgrep'))
        );
      })
    );

    const topRuntime = yield* queryFirst(
      env.DB,
      `SELECT runtime AS dimension
       FROM usage_runtime_daily
       WHERE license_id = ? AND date >= date('now', '-30 days')
       GROUP BY runtime
       ORDER BY SUM(usage_count) DESC, runtime ASC
       LIMIT 1`,
      [license.id],
      'topRuntime'
    ).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
      Effect.flatMap(row => {
        if (row === null) {
          return Effect.succeed('node');
        }
        return decodeRow(TopRuntimeRowSchema, 'Top runtime row has an invalid shape', row).pipe(
          Effect.map(decoded => decoded.dimension),
          Effect.catchAll(() => Effect.succeed('node'))
        );
      })
    );

    const rankRow = yield* queryFirst(
      env.DB,
      `SELECT COUNT(*) as better_users FROM (
         SELECT SUM(commands_run) as total FROM usage_daily GROUP BY license_id HAVING total > ?
       )`,
      [usageStats.total_commands],
      'percentileRank'
    ).pipe(Effect.catchAll(() => Effect.succeed(null)));
    const totalUsersRow = yield* queryFirst(
      env.DB,
      `SELECT COUNT(DISTINCT license_id) as count FROM usage_daily`,
      [],
      'percentileTotal'
    ).pipe(Effect.catchAll(() => Effect.succeed(null)));
    const betterUsers =
      rankRow === null
        ? 0
        : (yield* decodeRow(BetterUsersRowSchema, 'Rank row has an invalid shape', rankRow).pipe(
            Effect.catchAll(() => Effect.succeed({ better_users: 0 }))
          )).better_users;
    const totalUsersRaw =
      totalUsersRow === null
        ? 1
        : (yield* decodeRow(
            DistinctCountRowSchema,
            'User count row has an invalid shape',
            totalUsersRow
          ).pipe(Effect.catchAll(() => Effect.succeed({ count: 1 })))).count;
    const totalUsers = totalUsersRaw === 0 ? 1 : totalUsersRaw;
    const percentile = Math.round((1 - betterUsers / totalUsers) * 100);

    const leaderboardResult = yield* queryAll(
      env.DB,
      `SELECT SUBSTR(c.email, 1, 1) || '***' as user, SUM(u.time_saved_ms) as time_saved
       FROM usage_daily u
       JOIN licenses l ON u.license_id = l.id
       JOIN customers c ON l.customer_id = c.id
       GROUP BY c.id
       ORDER BY time_saved DESC
       LIMIT 3`,
      [],
      'leaderboard'
    ).pipe(Effect.catchAll(() => Effect.succeed({ results: undefined })));
    const leaderboard = yield* decodeRowArray(
      LeaderboardRowSchema,
      'Leaderboard rows have an invalid shape',
      leaderboardResult.results
    ).pipe(Effect.catchAll(() => Effect.succeed([])));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
      license: {
        id: license.id,
        license_key: license.license_key,
        tier: license.tier,
        status: license.status,
        max_machines: license.max_seats ?? license.max_machines ?? 1,
        expires_at: license.expires_at,
        features:
          license.tier === 'pro' || license.tier === 'team' || license.tier === 'enterprise'
            ? TIER_FEATURES[license.tier].features
            : TIER_FEATURES.free.features,
      },
      machines,
      usage: {
        total_commands: usageStats.total_commands,
        total_packages_installed: usageStats.total_packages_installed,
        total_packages_searched: usageStats.total_packages_searched,
        total_runtimes_switched: usageStats.total_runtimes_switched,
        total_sbom_generated: usageStats.total_sbom_generated,
        total_vulnerabilities_found: usageStats.total_vulnerabilities_found,
        total_time_saved_ms: usageStats.total_time_saved_ms,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        daily,
        breakdown,
      },
      achievements,
      subscription,
      invoices,
      is_admin: isAdmin,
      leaderboard,
      global_stats: {
        top_package: topPackage,
        top_runtime: topRuntime,
        percentile,
      },
    };
  });
}

/**
 * HTTP adapter for `GET /api/dashboard`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON dashboard payload or a mapped error response.
 */
export function handleGetDashboard(request: Request, env: Env): Promise<Response> {
  const dashboard = getAccountDashboard(request, env).pipe(
    Effect.flatMap(payload =>
      Schema.decodeUnknown(LicensingDashboardSchema)(payload).pipe(
        Effect.mapError(
          cause => new AccountDashboardParseError('Dashboard response has an invalid shape', cause)
        )
      )
    )
  );
  return respondFromEffect(dashboard, error => {
    switch (error._tag) {
      case 'SessionUnauthorizedError':
        return errorResponse(error.message, 401);
      case 'LicenseNotFoundError':
        return errorResponse(error.message, 404);
      case 'AccountDashboardParseError':
      case 'DashboardStoreUnavailable':
        return errorResponse(error.message, 500);
      default:
        return casesHandled(error);
    }
  });
}
