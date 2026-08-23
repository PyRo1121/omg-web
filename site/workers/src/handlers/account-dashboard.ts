import * as Schema from 'effect/Schema';
import { Cause, Effect, Exit, Option } from 'effect';
import {
  LicensingDashboardSchema,
  type LicensingDashboard,
} from '../../../shared/licensing-dashboard';
import {
  type Env,
  jsonResponse,
  errorResponse,
  ACHIEVEMENTS,
  TIER_FEATURES,
  type User,
} from '../api';
import { requireSession, SessionUnauthorizedError } from '../admin-auth';
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
  type DashboardLicenseRow,
  type UsageStatsRow,
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

type DashboardError =
  | SessionUnauthorizedError
  | LicenseNotFoundError
  | AccountDashboardParseError
  | DashboardStoreUnavailable;

function featuresForTier(tier: string): ReadonlyArray<string> {
  if (tier === 'pro' || tier === 'team' || tier === 'enterprise') {
    return TIER_FEATURES[tier].features;
  }
  return TIER_FEATURES.free.features;
}

function maxMachinesFor(license: DashboardLicenseRow): number {
  if (license.max_seats !== undefined && license.max_seats !== null) {
    return license.max_seats;
  }
  if (license.max_machines !== undefined && license.max_machines !== null) {
    return license.max_machines;
  }
  return 1;
}

function currentStreak(dates: ReadonlyArray<string>): number {
  if (dates.length === 0) {
    return 0;
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const first = dates[0];
  if (first !== today && first !== yesterday) {
    return 0;
  }
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    if (prev === undefined || curr === undefined) {
      break;
    }
    const diffDays = (new Date(prev).getTime() - new Date(curr).getTime()) / 86400000;
    if (diffDays === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function queryFirst(
  db: D1Database,
  sql: string,
  params: ReadonlyArray<string | number>,
  operation: string
) {
  return Effect.tryPromise({
    try: () => {
      const statement = db.prepare(sql);
      return params.length === 0 ? statement.first() : statement.bind(...params).first();
    },
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
    try: () => {
      const statement = db.prepare(sql);
      return params.length === 0 ? statement.all() : statement.bind(...params).all();
    },
    catch: cause => new DashboardStoreUnavailable(operation, cause),
  });
}

function emptyUsage(): UsageStatsRow {
  return {
    total_commands: 0,
    total_packages_installed: 0,
    total_packages_searched: 0,
    total_runtimes_switched: 0,
    total_sbom_generated: 0,
    total_vulnerabilities_found: 0,
    total_time_saved_ms: 0,
  };
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
): Effect.Effect<LicensingDashboard, DashboardError> {
  return Effect.gen(function* () {
    const auth = yield* requireSession(request, env);
    const user: User = auth.user;

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
        ? emptyUsage()
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
       ORDER BY date DESC LIMIT 60`,
      [license.id],
      'streak'
    );
    const streakRows = yield* decodeRowArray(
      StreakDateRowSchema,
      'Streak rows have an invalid shape',
      streakResult.results
    );
    const streak = currentStreak(streakRows.map(row => row.date));

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
      `SELECT package_name FROM analytics_packages ORDER BY install_count DESC LIMIT 1`,
      [],
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
      `SELECT dimension FROM analytics_daily WHERE metric = 'version' ORDER BY value DESC LIMIT 1`,
      [],
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
      `SELECT SUBSTR(c.email, 1, 3) || '***' as user, SUM(u.time_saved_ms) as time_saved
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
        max_machines: maxMachinesFor(license),
        expires_at: license.expires_at,
        features: [...featuresForTier(license.tier)],
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
        current_streak: streak,
        longest_streak: streak,
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

function httpStatusFor(error: DashboardError): number {
  switch (error._tag) {
    case 'SessionUnauthorizedError':
      return 401;
    case 'LicenseNotFoundError':
      return 404;
    case 'AccountDashboardParseError':
    case 'DashboardStoreUnavailable':
      return 500;
    default:
      return casesHandled(error);
  }
}

/**
 * HTTP adapter for `GET /api/dashboard`.
 *
 * @param request - Incoming request.
 * @param env - Worker bindings.
 * @returns JSON dashboard payload or a mapped error response.
 */
export async function handleGetDashboard(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(getAccountDashboard(request, env));
  return Exit.match(exit, {
    onSuccess: payload => {
      const decoded = Schema.decodeUnknownEither(LicensingDashboardSchema)(payload);
      return decoded._tag === 'Right'
        ? jsonResponse(decoded.right)
        : errorResponse('Dashboard response has an invalid shape', 500);
    },
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isSome(failure)) {
        const error = failure.value;
        return errorResponse(error.message, httpStatusFor(error));
      }
      return errorResponse('Internal server error', 500);
    },
  });
}
