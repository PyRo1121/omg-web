import { Effect } from 'effect';

import {
  AdminActivityRowSchema,
  AdminAuditLogRowSchema,
  AdminCohortRowSchema,
  AdminCommandCountRowSchema,
  AdminCommandHeatmapRowSchema,
  AdminCountsRowSchema,
  AdminCustomerDetailRowSchema,
  AdminChurnRiskSegmentRowSchema,
  AdminDailyActiveRowSchema,
  AdminDateCountRowSchema,
  AdminErrorTypeCountRowSchema,
  AdminExpansionOpportunityRowSchema,
  AdminFleetVersionRowSchema,
  AdminGeoDimensionRowSchema,
  AdminLicenseDetailRowSchema,
  AdminLtvByTierRowSchema,
  AdminMachineRowSchema,
  AdminMonthlyRevenueRowSchema,
  AdminPlatformCountRowSchema,
  AdminRetentionCohortRowSchema,
  AdminRevenueByTierRowSchema,
  AdminRuntimeAdoptionRowSchema,
  AdminRuntimeUsageRowSchema,
  AdminStatusCountRowSchema,
  AdminUsageDailyRowSchema,
  AdminUsageTotalsRowSchema,
  AdminUsersExportRowSchema,
  AdminUsersListRowSchema,
  AdminVersionCountRowSchema,
  AtRiskRowSchema,
  AuditCsvRowSchema,
  CommandStatsRowSchema,
  CountRowSchema,
  CurrentMrrRowSchema,
  CustomerHealthRowSchema,
  decodeExtraRow,
  decodeExtraRowArray,
  decodeOptionalExtraRow,
  FeatureAdoptionRowSchema,
  FunnelRowSchema,
  GlobalUsageRowSchema,
  GrowthRowSchema,
  HoursSavedRowSchema,
  IdRowSchema,
  JourneyRowSchema,
  PerformanceStatsRowSchema,
  RateRowSchema,
  SessionStatsRowSchema,
  TierCountRowSchema,
  TimeToValueRowSchema,
  UsageCsvRowSchema,
} from '../contracts/d1-extras';
import { isAdminCustomer } from '../admin-auth';

const ACTIVE_TIER_COUNTS_SQL =
  "SELECT l.tier, COUNT(*) as count FROM licenses l JOIN subscriptions s ON l.customer_id = s.customer_id WHERE s.status = 'active' AND l.tier != 'free' GROUP BY l.tier";

/**
 * Monthly USD list price per paid license tier.
 *
 * Single source of truth for pricing knowledge in this store: the SQL CASE
 * fragments below are generated from it so a price change cannot drift between
 * the LTV query, the current-MRR query, and the handler-side MRR math.
 */
export const TIER_MONTHLY_PRICES = {
  pro: 9,
  team: 200,
  enterprise: 500,
} as const;

const tierPriceCaseSql = (): string =>
  Object.entries(TIER_MONTHLY_PRICES)
    .map(([tier, price]) => `WHEN '${tier}' THEN ${price}`)
    .join(' ');

/** SQL fragment pricing `l.tier` at its monthly USD list price (0 for unknown/free). */
export const TIER_PRICE_CASE_SQL = `CASE l.tier ${tierPriceCaseSql()} ELSE 0 END`;

/** License tiers an admin may assign via the user-update endpoint. */
export const LICENSE_TIERS = ['free', 'pro', 'team', 'enterprise'] as const;
export type LicenseTier = (typeof LICENSE_TIERS)[number];

/** License statuses an admin may assign via the user-update endpoint. */
export const LICENSE_STATUSES = ['active', 'cancelled', 'inactive'] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

/** Upper bound for the user-search term; longer inputs are rejected upstream. */
export const MAX_SEARCH_LENGTH = 100;

/** An admin store operation failed (storage or row-shape error). */
class AdminStoreError extends Error {
  readonly _tag = 'AdminStoreError';
  constructor(
    readonly operation: string,
    override readonly cause?: unknown
  ) {
    super(`Admin store operation failed: ${operation}`);
  }
}

const fail = (operation: string) => (cause: unknown) => new AdminStoreError(operation, cause);

type BindValue = string | number | null;

const statement = (db: D1Database, sql: string, values: ReadonlyArray<BindValue> = []) => {
  const prepared = db.prepare(sql);
  return values.length === 0 ? prepared : prepared.bind(...values);
};

const rows = <S extends import('effect/Schema').Schema.AnyNoContext>(
  db: D1Database,
  schema: S,
  reason: string,
  sql: string,
  values: ReadonlyArray<BindValue> = []
) =>
  Effect.tryPromise({
    try: () => statement(db, sql, values).all(),
    catch: fail('rows'),
  }).pipe(Effect.flatMap(result => decodeExtraRowArray(schema, reason, result.results)));

const optionalRow = <S extends import('effect/Schema').Schema.AnyNoContext>(
  db: D1Database,
  schema: S,
  reason: string,
  sql: string,
  values: ReadonlyArray<BindValue> = []
) =>
  Effect.tryPromise({
    try: () => statement(db, sql, values).first(),
    catch: fail('optionalRow'),
  }).pipe(Effect.flatMap(value => decodeOptionalExtraRow(schema, reason, value)));

const requiredRow = <S extends import('effect/Schema').Schema.AnyNoContext>(
  db: D1Database,
  schema: S,
  reason: string,
  sql: string
) =>
  Effect.tryPromise({
    try: () => db.prepare(sql).first(),
    catch: fail('requiredRow'),
  }).pipe(Effect.flatMap(value => decodeExtraRow(schema, reason, value)));

/** Escape SQLite LIKE metacharacters so user input matches literally. */
function escapeLikePattern(search: string): string {
  return search.replace(/[\\%_]/g, char => `\\${char}`);
}

/** Return whether the customer currently has admin access. */
export const isAdmin = (db: D1Database, customerId: string) =>
  isAdminCustomer(db, customerId).pipe(
    Effect.mapError(error => new AdminStoreError('isAdmin', error))
  );

export interface AdminAuditInput {
  readonly action: string;
  readonly userId: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly metadata?: object;
  readonly success?: boolean;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly country?: string;
}

/** Persist one admin audit event. */
export const writeAudit = (
  db: D1Database,
  input: AdminAuditInput
): Effect.Effect<void, AdminStoreError> =>
  Effect.tryPromise({
    try: () =>
      db
        .prepare(
          'INSERT INTO audit_log (id, customer_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
        )
        .bind(
          crypto.randomUUID(),
          input.userId,
          input.action,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.ipAddress ?? null,
          input.userAgent ?? null,
          JSON.stringify({
            ...input.metadata,
            success: input.success ?? true,
            country: input.country ?? null,
            timestamp: new Date().toISOString(),
          })
        )
        .run()
        .then(() => undefined),
    catch: fail('writeAudit'),
  });

/** Load the complete dashboard snapshot. */
export const loadDashboard = (db: D1Database) =>
  Effect.gen(function* () {
    const results = yield* Effect.tryPromise({
      try: () =>
        db.batch([
          db.prepare(
            "SELECT (SELECT COUNT(*) FROM customers) as total_users, (SELECT COUNT(*) FROM licenses WHERE status = 'active') as active_licenses, (SELECT COUNT(*) FROM machines WHERE is_active = 1) as active_machines, (SELECT COUNT(*) FROM install_stats) as total_installs"
          ),
          db.prepare('SELECT tier, COUNT(*) as count FROM licenses GROUP BY tier'),
          db.prepare(
            "SELECT SUM(commands_run) as total_commands, SUM(packages_installed) as total_packages_installed, SUM(packages_searched) as total_searches, SUM(time_saved_ms) as total_time_saved_ms FROM usage_daily WHERE date >= date('now', '-30 days')"
          ),
          db.prepare(
            "SELECT date, COUNT(DISTINCT license_id) as active_users, SUM(commands_run) as commands FROM usage_daily WHERE date >= date('now', '-14 days') GROUP BY date ORDER BY date ASC"
          ),
          db.prepare(
            "SELECT DATE(created_at) as date, COUNT(*) as count FROM customers WHERE created_at >= datetime('now', '-7 days') GROUP BY DATE(created_at) ORDER BY date DESC"
          ),
          db.prepare(
            'SELECT platform, COUNT(*) as count FROM install_stats GROUP BY platform ORDER BY count DESC'
          ),
          db.prepare(
            'SELECT version, COUNT(*) as count FROM install_stats GROUP BY version ORDER BY count DESC LIMIT 10'
          ),
          db.prepare('SELECT status, COUNT(*) as count FROM subscriptions GROUP BY status'),
          db.prepare(ACTIVE_TIER_COUNTS_SQL),
          db.prepare('SELECT SUM(time_saved_ms) as total_time_saved FROM usage_daily'),
          db.prepare(
            'SELECT omg_version, COUNT(*) as count FROM machines WHERE is_active = 1 GROUP BY omg_version'
          ),
          db.prepare(
            "SELECT json_extract(metadata, '$.country') as dimension, COUNT(*) as count FROM audit_log WHERE action = 'machine.registered' AND created_at >= datetime('now', '-30 days') GROUP BY dimension ORDER BY count DESC LIMIT 10"
          ),
          db.prepare(
            "SELECT SUM(CASE WHEN action LIKE '%.success' THEN 1 ELSE 0 END) as success, SUM(CASE WHEN action LIKE '%.failed' THEN 1 ELSE 0 END) as failure FROM audit_log WHERE created_at >= datetime('now', '-24 hours')"
          ),
        ]),
      catch: fail('loadDashboard'),
    });

    const [counts, usageTotals, globalUsage, commandStats] = yield* Effect.all([
      decodeOptionalExtraRow(
        AdminCountsRowSchema,
        'Admin overview counts have an invalid shape',
        results[0]?.results?.[0]
      ),
      decodeOptionalExtraRow(
        AdminUsageTotalsRowSchema,
        'Admin usage totals have an invalid shape',
        results[2]?.results?.[0]
      ),
      decodeOptionalExtraRow(
        GlobalUsageRowSchema,
        'Admin global usage has an invalid shape',
        results[9]?.results?.[0]
      ),
      decodeOptionalExtraRow(
        CommandStatsRowSchema,
        'Admin command stats have an invalid shape',
        results[12]?.results?.[0]
      ),
    ]);
    const [
      tierBreakdown,
      dailyActiveUsers,
      recentSignups,
      installsByPlatform,
      installsByVersion,
      subscriptionStats,
      mrrData,
      fleetVersions,
      geoDistribution,
    ] = yield* Effect.all([
      decodeExtraRowArray(
        TierCountRowSchema,
        'Admin tier breakdown row has an invalid shape',
        results[1]?.results
      ),
      decodeExtraRowArray(
        AdminDailyActiveRowSchema,
        'Admin daily active row has an invalid shape',
        results[3]?.results
      ),
      decodeExtraRowArray(
        AdminDateCountRowSchema,
        'Admin signup row has an invalid shape',
        results[4]?.results
      ),
      decodeExtraRowArray(
        AdminPlatformCountRowSchema,
        'Admin platform install row has an invalid shape',
        results[5]?.results
      ),
      decodeExtraRowArray(
        AdminVersionCountRowSchema,
        'Admin version install row has an invalid shape',
        results[6]?.results
      ),
      decodeExtraRowArray(
        AdminStatusCountRowSchema,
        'Admin subscription status row has an invalid shape',
        results[7]?.results
      ),
      decodeExtraRowArray(
        TierCountRowSchema,
        'Admin MRR tier row has an invalid shape',
        results[8]?.results
      ),
      decodeExtraRowArray(
        AdminFleetVersionRowSchema,
        'Admin fleet version row has an invalid shape',
        results[10]?.results
      ),
      decodeExtraRowArray(
        AdminGeoDimensionRowSchema,
        'Admin geo distribution row has an invalid shape',
        results[11]?.results
      ),
    ]);
    return {
      counts,
      usageTotals,
      globalUsage,
      commandStats,
      tierBreakdown,
      dailyActiveUsers,
      recentSignups,
      installsByPlatform,
      installsByVersion,
      subscriptionStats,
      mrrData,
      fleetVersions,
      geoDistribution,
    };
  });

export interface ListUsersInput {
  readonly search: string;
  readonly limit: number;
  readonly offset: number;
}

/** One page of the enriched user-list CTE, shared by the page query and its count. */
const USER_STATS_CTE_SQL = `WITH user_stats AS (
      SELECT c.id, c.email, c.company, c.created_at,
        COALESCE(l.tier, 'free') as tier,
        COALESCE(l.status, 'inactive') as license_status,
        (SELECT COUNT(*) FROM machines m WHERE m.license_id = l.id AND m.is_active = 1) as machine_count,
        (SELECT SUM(u.commands_run) FROM usage_daily u WHERE u.license_id = l.id) as total_commands,
        (SELECT MAX(u.date) FROM usage_daily u WHERE u.license_id = l.id) as last_active_date,
        (SELECT COUNT(DISTINCT date) FROM usage_daily WHERE license_id = l.id AND date >= date('now', '-30 days')) as active_days_30d,
        (SELECT SUM(commands_run) FROM usage_daily WHERE license_id = l.id AND date >= date('now', '-3 days')) as cmds_3d,
        (SELECT SUM(commands_run) FROM usage_daily WHERE license_id = l.id AND date >= date('now', '-10 days') AND date < date('now', '-3 days')) as cmds_prev_7d
      FROM customers c LEFT JOIN licenses l ON c.id = l.customer_id
    )`;

/** List one page of CRM users with computed lifecycle fields, plus the unfiltered match total. */
export const listUsers = (db: D1Database, input: ListUsersInput) =>
  Effect.gen(function* () {
    // LIKE metacharacters are escaped so search terms match literally instead of
    // composing pathologically expensive wildcard patterns.
    const where =
      input.search.length > 0
        ? " WHERE email LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\'"
        : '';
    const searchValues: BindValue[] =
      input.search.length > 0
        ? [`%${escapeLikePattern(input.search)}%`, `%${escapeLikePattern(input.search)}%`]
        : [];
    const batchResults = yield* Effect.tryPromise({
      try: () =>
        db.batch([
          statement(
            db,
            `${USER_STATS_CTE_SQL}
    SELECT *,
      CASE WHEN COALESCE(cmds_prev_7d, 0) = 0 THEN 1.0 ELSE (COALESCE(cmds_3d, 0) / 3.0) / (COALESCE(cmds_prev_7d, 0) / 7.0 + 0.001) END as velocity,
      ROUND(MIN(40, (COALESCE(active_days_30d, 0) * 1.33)) + ((COALESCE(active_days_30d, 0) / 30.0) * 40) + MIN(20, (COALESCE(machine_count, 0) * 5))) as engagement_score,
      CASE
        WHEN last_active_date IS NULL THEN 'new'
        WHEN last_active_date < date('now', '-30 days') THEN 'churned'
        WHEN last_active_date < date('now', '-7 days') OR (COALESCE(cmds_prev_7d, 0) > 10 AND (COALESCE(cmds_3d, 0) / 3.0) / (COALESCE(cmds_prev_7d, 0) / 7.0 + 0.001) < 0.2) THEN 'at_risk'
        WHEN total_commands > 1000 OR active_days_30d > 20 THEN 'power_user'
        ELSE 'active'
      END as lifecycle_stage
    FROM user_stats${where} ORDER BY engagement_score DESC, created_at DESC LIMIT ? OFFSET ?`,
            [...searchValues, input.limit, input.offset]
          ),
          // `user_stats` is scoped to the preceding statement's CTE and cannot
          // be referenced by this independent batch statement. It has exactly
          // one row per customer, so the base-table count is equivalent and
          // avoids recomputing all aggregate statistics.
          statement(db, `SELECT COUNT(*) as count FROM customers${where}`, searchValues),
        ]),
      catch: fail('listUsers'),
    });
    const users = yield* decodeExtraRowArray(
      AdminUsersListRowSchema,
      'Admin user list row has an invalid shape',
      batchResults[0]?.results
    );
    const totalRow = yield* decodeOptionalExtraRow(
      CountRowSchema,
      'Admin user count row has an invalid shape',
      batchResults[1]?.results?.[0]
    );
    return { users, total: totalRow?.count ?? 0 };
  });

/** Load one customer, their license, machines, and recent usage. */
export const loadUserDetail = (db: D1Database, userId: string) =>
  Effect.gen(function* () {
    const user = yield* optionalRow(
      db,
      AdminCustomerDetailRowSchema,
      'Admin customer detail has an invalid shape',
      'SELECT id, email, company, tier, admin, stripe_customer_id, telemetry_opt_out, created_at, updated_at FROM customers WHERE id = ?',
      [userId]
    );
    if (user === undefined) return { _tag: 'user-missing' } as const;
    const license = yield* optionalRow(
      db,
      AdminLicenseDetailRowSchema,
      'Admin license detail has an invalid shape',
      'SELECT id, customer_id, license_key, tier, status, max_seats, max_machines, expires_at, created_at FROM licenses WHERE customer_id = ?',
      [userId]
    );
    if (license === undefined) return { _tag: 'license-missing' } as const;
    const machines = yield* rows(
      db,
      AdminMachineRowSchema,
      'Admin machine row has an invalid shape',
      'SELECT id, license_id, machine_id, hostname, os, arch, omg_version, user_name, user_email, is_active, first_seen_at, last_seen_at FROM machines WHERE license_id = ?',
      [license.id]
    );
    const usage = yield* rows(
      db,
      AdminUsageDailyRowSchema,
      'Admin usage daily row has an invalid shape',
      'SELECT date, license_id, commands_run, packages_installed, packages_searched, runtimes_switched, sbom_generated, vulnerabilities_found, time_saved_ms FROM usage_daily WHERE license_id = ? ORDER BY date DESC LIMIT 30',
      [license.id]
    );
    return { _tag: 'found', user, license, machines, usage } as const;
  });

export interface UpdateUserInput {
  readonly userId: string;
  readonly tier?: LicenseTier;
  readonly status?: LicenseStatus;
}

/** Outcome of an admin user update. */
export type UpdateUserResult =
  { readonly _tag: 'updated' } | { readonly _tag: 'customer-not-found' };

/**
 * Apply the supplied license changes for a customer.
 *
 * Customers without a license row resolve to `customer-not-found` instead of a
 * silent no-op success, so callers can audit and report the miss truthfully.
 */
export const updateUser = (
  db: D1Database,
  input: UpdateUserInput
): Effect.Effect<UpdateUserResult, AdminStoreError> =>
  Effect.gen(function* () {
    const updatedRow = yield* Effect.tryPromise({
      try: () =>
        statement(
          db,
          'UPDATE licenses SET tier = COALESCE(?, tier), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? RETURNING id',
          [input.tier ?? null, input.status ?? null, input.userId]
        ).first(),
      catch: fail('updateUser'),
    });
    const updated = yield* decodeOptionalExtraRow(
      IdRowSchema,
      'Admin updated license row has an invalid shape',
      updatedRow
    ).pipe(Effect.mapError(cause => new AdminStoreError('updateUser', cause)));
    return updated === null
      ? ({ _tag: 'customer-not-found' } as const)
      : ({ _tag: 'updated' } as const);
  });

/** Load one page of the latest admin activity. */
export const listActivity = (db: D1Database, limit: number, offset: number) =>
  rows(
    db,
    AdminActivityRowSchema,
    'Admin activity row has an invalid shape',
    'SELECT id, customer_id, action, resource_type, resource_id, ip_address, created_at FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );

/** Load usage rows for CSV export (capped at the newest 1000 days of data). */
export const exportUsage = (db: D1Database) =>
  rows(
    db,
    UsageCsvRowSchema,
    'Usage CSV row has an invalid shape',
    'SELECT date, license_id, commands_run, time_saved_ms FROM usage_daily ORDER BY date DESC LIMIT 1000'
  );

/** Load audit rows for CSV export (capped at the newest 1000 events). */
export const exportAudit = (db: D1Database) =>
  rows(
    db,
    AuditCsvRowSchema,
    'Audit CSV row has an invalid shape',
    'SELECT created_at, action, customer_id, ip_address FROM audit_log ORDER BY created_at DESC LIMIT 1000'
  );

/** Load product, growth, performance, and usage analytics. */
export const loadAnalytics = (db: D1Database) =>
  Effect.gen(function* () {
    const commandsByType = yield* rows(
      db,
      AdminCommandCountRowSchema,
      'Admin command count row has an invalid shape',
      "SELECT json_extract(properties, '$.command') as command, COUNT(*) as count FROM analytics_events WHERE event_type = 'command' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
    );
    const errorsByType = yield* rows(
      db,
      AdminErrorTypeCountRowSchema,
      'Admin error type row has an invalid shape',
      "SELECT json_extract(properties, '$.error_type') as error_type, COUNT(*) as count FROM analytics_events WHERE event_type = 'error' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
    );
    const growth = yield* optionalRow(
      db,
      GrowthRowSchema,
      'Admin growth row has an invalid shape',
      "SELECT (SELECT COUNT(*) FROM customers WHERE created_at >= datetime('now', '-7 days')) as new_users_7d, (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND created_at >= datetime('now', '-7 days')) as new_paid_7d"
    );
    // Week-over-week signup growth in whole percent, comparing this week to the prior one.
    const growthRate = yield* optionalRow(
      db,
      RateRowSchema,
      'Admin growth rate row has an invalid shape',
      "SELECT CASE WHEN prev.count = 0 THEN 0 ELSE CAST((curr.count - prev.count) * 100.0 / prev.count AS INTEGER) END as rate FROM (SELECT COUNT(*) as count FROM customers WHERE created_at >= datetime('now', '-7 days')) curr, (SELECT COUNT(*) as count FROM customers WHERE created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')) prev"
    );
    const timeSaved = yield* optionalRow(
      db,
      HoursSavedRowSchema,
      'Admin hours-saved row has an invalid shape',
      'SELECT SUM(time_saved_ms) / 3600000.0 as total_hours FROM usage_daily'
    );
    const funnel = yield* optionalRow(
      db,
      FunnelRowSchema,
      'Admin funnel row has an invalid shape',
      "SELECT (SELECT COUNT(*) FROM install_stats WHERE created_at >= datetime('now', '-30 days')) as installs, (SELECT COUNT(DISTINCT u.license_id) FROM usage_daily u WHERE u.date >= datetime('now', '-30 days') AND u.commands_run > 0) as activated, (SELECT COUNT(DISTINCT u.license_id) FROM usage_daily u WHERE u.date >= datetime('now', '-30 days') GROUP BY u.license_id HAVING SUM(u.commands_run) > 1000) as power_users"
    );
    const churnRisk = yield* optionalRow(
      db,
      AtRiskRowSchema,
      'Admin at-risk row has an invalid shape',
      "SELECT COUNT(*) as at_risk_users FROM (SELECT l.customer_id, (SELECT SUM(commands_run) FROM usage_daily WHERE license_id = l.id AND date >= date('now', '-3 days')) as cmds_3d, (SELECT SUM(commands_run) FROM usage_daily WHERE license_id = l.id AND date >= date('now', '-10 days') AND date < date('now', '-3 days')) as cmds_prev_7d FROM licenses l WHERE l.status = 'active' HAVING (COALESCE(cmds_prev_7d, 0) > 10 AND (COALESCE(cmds_3d, 0) / 3.0) / (COALESCE(cmds_prev_7d, 0) / 7.0 + 0.001) < 0.2) OR (SELECT MAX(date) FROM usage_daily WHERE license_id = l.id) < date('now', '-7 days'))"
    );
    const retentionRate = yield* optionalRow(
      db,
      RateRowSchema,
      'Admin retention rate row has an invalid shape',
      "SELECT CASE WHEN (SELECT COUNT(*) FROM customers WHERE created_at >= datetime('now', '-90 days')) = 0 THEN 0 ELSE CAST((SELECT COUNT(DISTINCT u.license_id) FROM usage_daily u WHERE u.date >= datetime('now', '-7 days')) * 100.0 / (SELECT COUNT(*) FROM customers WHERE created_at >= datetime('now', '-90 days')) AS INTEGER) END as rate"
    );
    const performance = yield* optionalRow(
      db,
      PerformanceStatsRowSchema,
      'Admin performance row has an invalid shape',
      "SELECT AVG(duration_ms) as avg_ms, MIN(duration_ms) as min_ms, MAX(duration_ms) as max_ms, COUNT(*) as count FROM analytics_events WHERE event_type = 'performance' AND created_at >= datetime('now', '-7 days')"
    );
    const sessions = yield* optionalRow(
      db,
      SessionStatsRowSchema,
      'Admin session stats row has an invalid shape',
      "SELECT COUNT(DISTINCT session_id) as total_sessions, COUNT(CASE WHEN event_type = 'session_start' THEN 1 END) as sessions_started, COUNT(CASE WHEN event_type = 'heartbeat' THEN 1 END) as heartbeats_sent, AVG(CASE WHEN event_type = 'session_end' THEN json_extract(properties, '$.duration_seconds') END) as avg_duration_seconds, MAX(CASE WHEN event_type = 'session_end' THEN json_extract(properties, '$.duration_seconds') END) as max_duration_seconds FROM analytics_events WHERE event_type IN ('session_start', 'heartbeat', 'session_end') AND created_at >= datetime('now', '-30 days')"
    );
    const userJourney = yield* optionalRow(
      db,
      JourneyRowSchema,
      'Admin journey row has an invalid shape',
      "WITH latest_stages AS (SELECT customer_id, MAX(CASE json_extract(properties, '$.to_stage') WHEN 'installed' THEN 1 WHEN 'activated' THEN 2 WHEN 'first_command' THEN 3 WHEN 'exploring' THEN 4 WHEN 'engaged' THEN 5 WHEN 'power_user' THEN 6 WHEN 'at_risk' THEN 7 WHEN 'churned' THEN 8 ELSE 0 END) as stage_order FROM analytics_events WHERE event_type = 'feature' AND event_name = 'stage_transition' AND created_at >= datetime('now', '-30 days') GROUP BY customer_id) SELECT SUM(CASE WHEN stage_order = 1 THEN 1 END) as installed, SUM(CASE WHEN stage_order = 2 THEN 1 END) as activated, SUM(CASE WHEN stage_order = 3 THEN 1 END) as first_command, SUM(CASE WHEN stage_order = 4 THEN 1 END) as exploring, SUM(CASE WHEN stage_order = 5 THEN 1 END) as engaged, SUM(CASE WHEN stage_order = 6 THEN 1 END) as power_user FROM latest_stages"
    );
    const runtimeUsage = yield* rows(
      db,
      AdminRuntimeUsageRowSchema,
      'Admin runtime usage row has an invalid shape',
      "SELECT json_extract(properties, '$.runtime') as runtime, COUNT(*) as count, COUNT(DISTINCT machine_id) as machines FROM analytics_events WHERE (event_name = 'runtime_switch' OR event_name = 'runtime_use') AND created_at >= datetime('now', '-30 days') GROUP BY 1 ORDER BY 2 DESC"
    );
    return {
      commandsByType,
      errorsByType,
      growth,
      growthRate,
      timeSaved,
      funnel,
      churnRisk,
      retentionRate,
      performance,
      sessions,
      userJourney,
      runtimeUsage,
    };
  });

/** Load monthly customer retention cohorts. */
export const listCohorts = (db: D1Database) =>
  rows(
    db,
    AdminCohortRowSchema,
    'Admin cohort row has an invalid shape',
    `WITH user_cohorts AS (
    SELECT id as customer_id, strftime('%Y-%m', created_at) as cohort_month FROM customers WHERE created_at >= datetime('now', '-13 months')
  ), activity_months AS (
    SELECT l.customer_id, strftime('%Y-%m', u.date) as active_month FROM usage_daily u JOIN licenses l ON u.license_id = l.id GROUP BY 1, 2
  )
  SELECT c.cohort_month,
    CAST((julianday(a.active_month || '-01') - julianday(c.cohort_month || '-01')) / 30.44 AS INTEGER) as month_index,
    COUNT(DISTINCT a.customer_id) as active_users
  FROM user_cohorts c LEFT JOIN activity_months a ON c.customer_id = a.customer_id
  WHERE month_index >= 0 AND month_index < 12 GROUP BY 1, 2 ORDER BY 1 DESC, 2 ASC`
  );

/** Load revenue history, tier totals, and active paid-tier counts. */
export const loadRevenue = (db: D1Database) =>
  Effect.gen(function* () {
    const monthly = yield* rows(
      db,
      AdminMonthlyRevenueRowSchema,
      'Admin monthly revenue row has an invalid shape',
      "SELECT strftime('%Y-%m', created_at) as month, SUM(amount_cents) / 100.0 as revenue, COUNT(*) as transactions FROM invoices WHERE status = 'paid' GROUP BY month ORDER BY month DESC LIMIT 12"
    );
    const byTier = yield* rows(
      db,
      AdminRevenueByTierRowSchema,
      'Admin revenue-by-tier row has an invalid shape',
      "SELECT l.tier, SUM(i.amount_cents) / 100.0 as total_revenue, COUNT(DISTINCT l.customer_id) as customers FROM invoices i JOIN licenses l ON i.customer_id = l.customer_id WHERE i.status = 'paid' GROUP BY l.tier"
    );
    const mrrTiers = yield* rows(
      db,
      TierCountRowSchema,
      'Admin revenue tier row has an invalid shape',
      ACTIVE_TIER_COUNTS_SQL
    );
    return { monthly, byTier, mrrTiers };
  });

/** Load the complete user CSV export (capped at the newest 1000 customers). */
export const exportUsers = (db: D1Database) =>
  rows(
    db,
    AdminUsersExportRowSchema,
    'Admin users export row has an invalid shape',
    'SELECT c.id, c.email, c.company, c.created_at, l.tier, l.status, (SELECT COUNT(*) FROM machines m WHERE m.license_id = l.id AND m.is_active = 1) as active_machines, (SELECT SUM(commands_run) FROM usage_daily u WHERE u.license_id = l.id) as total_commands FROM customers c LEFT JOIN licenses l ON c.id = l.customer_id ORDER BY c.created_at DESC LIMIT 1000'
  );

/** Load one page of enriched audit events, plus the total event count. */
export const listAuditLog = (db: D1Database, limit: number, offset: number) =>
  Effect.gen(function* () {
    const batchResults = yield* Effect.tryPromise({
      try: () =>
        db.batch([
          statement(
            db,
            'SELECT a.id, a.customer_id, c.email as user_email, a.action, a.ip_address, a.metadata, a.created_at FROM audit_log a LEFT JOIN customers c ON a.customer_id = c.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?',
            [limit, offset]
          ),
          statement(db, 'SELECT COUNT(*) as count FROM audit_log'),
        ]),
      catch: fail('listAuditLog'),
    });
    const logs = yield* decodeExtraRowArray(
      AdminAuditLogRowSchema,
      'Admin audit log row has an invalid shape',
      batchResults[0]?.results
    );
    const totalRow = yield* decodeOptionalExtraRow(
      CountRowSchema,
      'Admin audit log count row has an invalid shape',
      batchResults[1]?.results?.[0]
    );
    return { logs, total: totalRow?.count ?? 0 };
  });

/** Load advanced engagement, retention, adoption, and revenue metrics. */
export const loadAdvancedMetrics = (db: D1Database) =>
  Effect.all(
    {
      dau: requiredRow(
        db,
        CountRowSchema,
        'Admin DAU row has an invalid shape',
        "SELECT COUNT(DISTINCT license_id) as count FROM usage_daily WHERE date = date('now') AND commands_run > 0"
      ),
      wau: requiredRow(
        db,
        CountRowSchema,
        'Admin WAU row has an invalid shape',
        "SELECT COUNT(DISTINCT license_id) as count FROM usage_daily WHERE date >= date('now', '-7 days') AND commands_run > 0"
      ),
      mau: requiredRow(
        db,
        CountRowSchema,
        'Admin MAU row has an invalid shape',
        "SELECT COUNT(DISTINCT license_id) as count FROM usage_daily WHERE date >= date('now', '-30 days') AND commands_run > 0"
      ),
      retention: rows(
        db,
        AdminRetentionCohortRowSchema,
        'Admin retention cohort row has an invalid shape',
        `SELECT DATE(c.created_at) as cohort_date,
        CAST((julianday(u.date) - julianday(DATE(c.created_at))) / 7 AS INTEGER) as week_number,
        COUNT(DISTINCT c.id) as retained_users
        FROM customers c JOIN licenses l ON c.id = l.customer_id JOIN usage_daily u ON l.id = u.license_id
        WHERE c.created_at >= datetime('now', '-90 days') AND u.commands_run > 0
        GROUP BY cohort_date, week_number ORDER BY cohort_date DESC, week_number ASC LIMIT 100`
      ),
      ltvByTier: rows(
        db,
        AdminLtvByTierRowSchema,
        'Admin LTV row has an invalid shape',
        `SELECT l.tier, COUNT(*) as customer_count,
        AVG(${TIER_PRICE_CASE_SQL} * (julianday('now') - julianday(c.created_at)) / 30.0) as avg_ltv
        FROM customers c JOIN licenses l ON c.id = l.customer_id WHERE l.tier != 'free' GROUP BY l.tier`
      ),
      adoption: requiredRow(
        db,
        FeatureAdoptionRowSchema,
        'Admin feature adoption row has an invalid shape',
        `SELECT SUM(packages_installed) as total_installs, SUM(packages_searched) as total_searches,
        SUM(runtimes_switched) as total_runtime_switches,
        COUNT(DISTINCT CASE WHEN packages_installed > 0 THEN license_id END) as install_adopters,
        COUNT(DISTINCT CASE WHEN packages_searched > 0 THEN license_id END) as search_adopters,
        COUNT(DISTINCT CASE WHEN runtimes_switched > 0 THEN license_id END) as runtime_adopters,
        COUNT(DISTINCT license_id) as total_active_users FROM usage_daily WHERE date >= date('now', '-30 days')`
      ),
      heatmap: rows(
        db,
        AdminCommandHeatmapRowSchema,
        'Admin command heatmap row has an invalid shape',
        `SELECT strftime('%H', created_at) as hour, strftime('%w', created_at) as day_of_week, COUNT(*) as event_count
        FROM analytics_events WHERE event_type = 'command' AND created_at >= datetime('now', '-7 days')
        GROUP BY hour, day_of_week ORDER BY day_of_week, hour`
      ),
      runtimeRows: rows(
        db,
        AdminRuntimeAdoptionRowSchema,
        'Admin runtime adoption row has an invalid shape',
        `SELECT json_extract(properties, '$.runtime') as runtime, COUNT(DISTINCT machine_id) as unique_users, COUNT(*) as total_uses
        FROM analytics_events WHERE event_name IN ('runtime_switch', 'runtime_use') AND created_at >= datetime('now', '-30 days')
        GROUP BY runtime ORDER BY unique_users DESC`
      ),
      churn: rows(
        db,
        AdminChurnRiskSegmentRowSchema,
        'Admin churn-risk row has an invalid shape',
        `SELECT l.tier, COUNT(*) as user_count,
        CASE WHEN MAX(u.date) < date('now', '-14 days') THEN 'critical' WHEN MAX(u.date) < date('now', '-7 days') THEN 'high' ELSE 'healthy' END as risk_segment
        FROM licenses l LEFT JOIN usage_daily u ON l.id = u.license_id WHERE l.status = 'active' GROUP BY l.id`
      ),
      expansion: rows(
        db,
        AdminExpansionOpportunityRowSchema,
        'Admin expansion opportunity row has an invalid shape',
        `SELECT c.email, l.tier, COUNT(DISTINCT m.id) as active_machines, SUM(u.commands_run) as total_commands_30d,
        CASE WHEN l.tier = 'free' AND SUM(u.commands_run) > 500 THEN 'upsell_to_pro' WHEN l.tier = 'pro' AND COUNT(DISTINCT m.id) >= 3 THEN 'upsell_to_team' ELSE NULL END as opportunity_type,
        'medium' as priority
        FROM licenses l JOIN customers c ON l.customer_id = c.id
        LEFT JOIN machines m ON l.id = m.license_id AND m.is_active = 1
        LEFT JOIN usage_daily u ON l.id = u.license_id AND u.date >= date('now', '-30 days')
        WHERE l.status = 'active' GROUP BY l.customer_id HAVING opportunity_type IS NOT NULL LIMIT 50`
      ),
      timeToValue: requiredRow(
        db,
        TimeToValueRowSchema,
        'Admin time-to-value row has an invalid shape',
        `SELECT AVG(days_to_activation) as avg_days_to_activation, AVG(activated_week1) * 100.0 as pct_activated_week1
        FROM (SELECT julianday(MIN(u.date)) - julianday(c.created_at) as days_to_activation,
          CASE WHEN julianday(MIN(u.date)) - julianday(c.created_at) <= 7 THEN 1.0 ELSE 0.0 END as activated_week1
          FROM customers c JOIN licenses l ON c.id = l.customer_id
          LEFT JOIN usage_daily u ON l.id = u.license_id AND u.commands_run > 0
          WHERE c.created_at >= datetime('now', '-90 days') GROUP BY c.id)`
      ),
      revenue: requiredRow(
        db,
        CurrentMrrRowSchema,
        'Admin current MRR row has an invalid shape',
        `SELECT SUM(${TIER_PRICE_CASE_SQL}) as current_mrr
        FROM licenses l JOIN subscriptions s ON l.customer_id = s.customer_id WHERE s.status = 'active' AND l.tier != 'free'`
      ),
      // MRR contributed by paid subscriptions started within the trailing 12
      // months; reported as the expansion-pipeline metric.
      expansionMrr: optionalRow(
        db,
        RateRowSchema,
        'Admin expansion MRR row has an invalid shape',
        `SELECT COALESCE(SUM(${TIER_PRICE_CASE_SQL}), 0) as rate
        FROM licenses l JOIN subscriptions s ON l.customer_id = s.customer_id
        WHERE s.status = 'active' AND l.tier != 'free' AND s.created_at >= datetime('now', '-12 months')`
      ),
    },
    { concurrency: 'unbounded' }
  );

/** Load a customer's latest computed health score. */
export const getCustomerHealth = (db: D1Database, customerId: string) =>
  optionalRow(
    db,
    CustomerHealthRowSchema,
    'Customer health row has an invalid shape',
    'SELECT customer_id, overall_score, engagement_score, activation_score, growth_score, risk_score, lifecycle_stage, updated_at FROM customer_health WHERE customer_id = ?',
    [customerId]
  );
