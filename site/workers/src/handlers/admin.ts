/** Admin HTTP handlers. Persistence lives in the admin and CRM stores. */
import { Cause, Effect, Exit, Option, type Schema } from 'effect';

import { type Env, errorResponse, getAuthToken, jsonResponse, validateSession } from '../api';
import { decodeJsonBody } from '../body';
import {
  AdminAssignTagBodySchema,
  AdminCreateNoteBodySchema,
  AdminCreateTagBodySchema,
  AdminUpdateNoteBodySchema,
  AdminUpdateUserBodySchema,
} from '../contracts/http-bodies';
import { reportError, reportWarning } from '../observability';
import * as AdminStore from '../store/admin-store';
import {
  assignTag,
  createNote,
  createTag,
  deleteNote,
  listCustomerTags,
  listNotes,
  listTagCatalog,
  removeTag,
  updateNote,
} from '../store/crm';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

function secureJsonResponse<T>(data: T, status = 200): Response {
  const response = jsonResponse(data, status);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
  return response;
}

interface AdminContext {
  readonly user: { readonly id: string; readonly email: string };
  readonly requestId: string;
}

/** Highest page index accepted; larger values are clamped to bound OFFSET cost. */
const MAX_PAGE = 10_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parsePaginationParam(raw: string | null, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/** Parse a 1-based page parameter, clamped so OFFSET stays bounded. */
function parsePage(raw: string | null): number {
  return Math.min(parsePaginationParam(raw, 1), MAX_PAGE);
}

/** Parse a page-size parameter capped at MAX_PAGE_SIZE. */
function parsePageSize(raw: string | null): number {
  return Math.min(parsePaginationParam(raw, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
}

/** Return the first allowed union member equal to `value`, else undefined. */
function matchUnion<T extends string>(
  allowed: readonly T[],
  value: string | undefined
): T | undefined {
  if (value === undefined) return undefined;
  return allowed.find(candidate => candidate === value);
}

/** Milliseconds in one hour, for converting saved-time aggregates to hours. */
const MS_PER_HOUR = 3_600_000;
/** Estimated USD value of one developer hour, used for the global-value metric. */
const VALUE_PER_HOUR_USD = 100;

/** String-keyed view of the store's tier price table for handler-side MRR math. */
const TIER_MONTHLY_PRICE_BY_TIER: ReadonlyMap<string, number> = new Map(
  Object.entries(AdminStore.TIER_MONTHLY_PRICES)
);

function computeMrr(
  rows: ReadonlyArray<{ readonly tier: string; readonly count: number }>
): number {
  return rows.reduce(
    (mrr, row) => mrr + (TIER_MONTHLY_PRICE_BY_TIER.get(row.tier) ?? 0) * row.count,
    0
  );
}

function numberOrZero(value: number | null | undefined): number {
  return value || 0;
}

async function logAdminAudit<TMetadata extends object>(
  db: D1Database,
  entry: {
    readonly action: string;
    readonly userId: string;
    readonly request?: Request;
    readonly resourceType?: string;
    readonly resourceId?: string;
    readonly metadata?: TMetadata;
    readonly success?: boolean;
  }
): Promise<void> {
  try {
    const ipAddress = entry.request?.headers.get('CF-Connecting-IP');
    const userAgent = entry.request?.headers.get('User-Agent');
    const country = entry.request?.headers.get('CF-IPCountry');
    await Effect.runPromise(
      AdminStore.writeAudit(db, {
        action: entry.action,
        userId: entry.userId,
        ...(entry.resourceType !== undefined && { resourceType: entry.resourceType }),
        ...(entry.resourceId !== undefined && { resourceId: entry.resourceId }),
        ...(entry.metadata !== undefined && { metadata: entry.metadata }),
        ...(entry.success !== undefined && { success: entry.success }),
        ...(ipAddress !== null && ipAddress !== undefined && { ipAddress }),
        ...(userAgent !== null && userAgent !== undefined && { userAgent }),
        ...(country !== null && country !== undefined && { country }),
      })
    );
  } catch (error: unknown) {
    // Best-effort by design, but never silent: every failure surfaces through
    // the structured error pipeline with the denied/lost action attached.
    reportError(`Admin audit log error (${entry.action})`, error);
  }
}

function parseRequestUrl(rawUrl: string): URL | null {
  return URL.parse(rawUrl);
}

async function validateAdmin(
  request: Request,
  env: Env
): Promise<{ readonly context: AdminContext } | { readonly error: Response }> {
  const token = getAuthToken(request);
  if (token === null) {
    reportWarning('admin.auth.rejected', 'Admin route hit without a bearer token');
    return { error: errorResponse('Unauthorized', 401) };
  }
  const auth = await validateSession(env.DB, token);
  if (auth === null) {
    reportWarning('admin.auth.rejected', 'Admin route hit with an invalid or expired session');
    return { error: errorResponse('Invalid or expired session', 401) };
  }

  if (!(await Effect.runPromise(AdminStore.isAdmin(env.DB, auth.user.id)))) {
    await logAdminAudit(env.DB, {
      action: 'admin.unauthorized_access',
      userId: auth.user.id,
      request,
      metadata: {
        attempted_path: (parseRequestUrl(request.url)?.pathname ?? request.url).slice(0, 256),
      },
      success: false,
    });
    return { error: errorResponse('Unauthorized', 403) };
  }
  return {
    context: {
      user: auth.user,
      requestId: crypto.randomUUID(),
    },
  };
}

async function withAdminContext(
  request: Request,
  env: Env,
  handler: (context: AdminContext) => Promise<Response>
): Promise<Response> {
  const result = await validateAdmin(request, env);
  return 'error' in result ? result.error : handler(result.context);
}

async function withAdminQuery(
  request: Request,
  env: Env,
  handler: (context: AdminContext, url: URL) => Promise<Response>
): Promise<Response> {
  const url = parseRequestUrl(request.url);
  if (url === null) {
    return errorResponse('Invalid request URL', 400);
  }
  return withAdminContext(request, env, context => handler(context, url));
}

async function withAdminBody<S extends Schema.Schema.AnyNoContext>(
  request: Request,
  env: Env,
  schema: S,
  handler: (context: AdminContext, body: Schema.Schema.Type<S>) => Promise<Response>
): Promise<Response> {
  return withAdminContext(request, env, async context => {
    const decoded = await Effect.runPromise(
      decodeJsonBody(request, schema).pipe(
        Effect.match({
          onFailure: () => undefined,
          onSuccess: value => value,
        })
      )
    );
    return decoded === undefined
      ? errorResponse('Invalid JSON body', 400)
      : handler(context, decoded);
  });
}

async function storeResponse<A, E>(
  effect: Effect.Effect<A, E>,
  failureMessage: (error: E) => string,
  respond: (value: A) => Response | Promise<Response>
): Promise<Response> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    // Store errors are unexpected by definition; report them instead of
    // rendering a bare 500 with no server-side trace.
    reportError(
      'Admin store operation failed',
      Option.isSome(failure) ? failure.value : exit.cause
    );
    return errorResponse(
      Option.isSome(failure) ? failureMessage(failure.value) : 'Internal server error',
      500
    );
  }
  return respond(exit.value);
}

function storeFailure(message: string) {
  return () => message;
}

/**
 * Render one CSV cell, neutralizing spreadsheet formula injection.
 *
 * Values beginning with `=`, `+`, `-`, `@`, or a tab would execute as formulas
 * when the export opens in Excel or LibreOffice — even double-quoted — because
 * those applications reparse the cell content. Such cells are prefixed with a
 * single quote and quoted; cells containing delimiters or newlines are quoted.
 */
function escapeCSV<T>(value: T): string {
  const text = String(value ?? '');
  const isFormulaLike = /^[=+\-@\t\r]/.test(text);
  const needsQuoting = /[",\n\r]/.test(text);
  if (!isFormulaLike && !needsQuoting) return text;
  const neutralized = isFormulaLike ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function csvResponse(
  filename: string,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): Response {
  // UTF-8 BOM keeps Excel/LibreOffice from mojibaking non-ASCII values; the
  // trailing newline matches RFC 4180's final CRLF expectation.
  const body = `\uFEFF${[headers.join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n')}\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Load the admin dashboard snapshot.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns Overview metrics, fleet and tier breakdowns, and usage aggregates.
 */
export async function handleAdminDashboard(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(
      AdminStore.loadDashboard(env.DB),
      storeFailure('Failed to load dashboard'),
      data => {
        const globalUsageMs = numberOrZero(data.globalUsage?.total_time_saved);
        const globalValueUSD = Math.round((globalUsageMs / MS_PER_HOUR) * VALUE_PER_HOUR_USD);
        return secureJsonResponse({
          request_id: context.requestId,
          overview: {
            total_users: numberOrZero(data.counts?.total_users),
            active_licenses: numberOrZero(data.counts?.active_licenses),
            active_machines: numberOrZero(data.counts?.active_machines),
            total_installs: numberOrZero(data.counts?.total_installs),
            mrr: computeMrr(data.mrrData),
            global_value_usd: globalValueUSD,
            command_health: {
              success: numberOrZero(data.commandStats?.success),
              failure: numberOrZero(data.commandStats?.failure),
            },
          },
          fleet: { versions: data.fleetVersions },
          tiers: data.tierBreakdown,
          usage: {
            total_commands: numberOrZero(data.usageTotals?.total_commands),
            total_packages_installed: numberOrZero(data.usageTotals?.total_packages_installed),
            total_searches: numberOrZero(data.usageTotals?.total_searches),
            total_time_saved_ms: numberOrZero(data.usageTotals?.total_time_saved_ms),
          },
          daily_active_users: data.dailyActiveUsers,
          recent_signups: data.recentSignups,
          installs_by_platform: data.installsByPlatform,
          installs_by_version: data.installsByVersion,
          subscriptions: data.subscriptionStats,
          geo_distribution: data.geoDistribution,
        });
      }
    )
  );
}

/**
 * List CRM users with lifecycle scoring and pagination totals.
 *
 * @param request - Incoming GET with `page`, `limit`, and optional `search`.
 * @param env - Worker bindings.
 * @returns One user page plus `{ page, limit, total, pages }`.
 */
export async function handleAdminCRMUsers(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const search = url.searchParams.get('search') ?? '';
    if (search.length > AdminStore.MAX_SEARCH_LENGTH) {
      return Promise.resolve(errorResponse('Search term too long', 400));
    }
    const page = parsePage(url.searchParams.get('page'));
    const limit = parsePageSize(url.searchParams.get('limit'));
    return storeResponse(
      AdminStore.listUsers(env.DB, { search, limit, offset: (page - 1) * limit }),
      storeFailure('Failed to load users'),
      ({ users, total }) =>
        secureJsonResponse({
          request_id: context.requestId,
          users,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        })
    );
  });
}

/**
 * Load one customer with license, machines, and recent usage.
 *
 * @param request - Incoming GET with required `id` query parameter.
 * @param env - Worker bindings.
 * @returns The customer detail payload, or 400/404 when the id is missing or unknown.
 */
export async function handleAdminUserDetail(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const userId = url.searchParams.get('id');
    if (userId === null || userId.length === 0) {
      return Promise.resolve(errorResponse('User ID required', 400));
    }
    return storeResponse(
      AdminStore.loadUserDetail(env.DB, userId),
      () => 'Failed to load user detail',
      detail => {
        if (detail._tag === 'user-missing') return errorResponse('User not found', 404);
        if (detail._tag === 'license-missing')
          return errorResponse('License not found for user', 404);
        return secureJsonResponse({
          request_id: context.requestId,
          user: detail.user,
          license: detail.license,
          machines: detail.machines,
          usage: detail.usage,
        });
      }
    );
  });
}

/**
 * Apply tier/status changes to a customer's license.
 *
 * Audits every outcome — success, unknown customer, and store failure — with
 * the caller's request context.
 *
 * @param request - Incoming POST with `{ userId, tier?, status? }`.
 * @param env - Worker bindings.
 * @returns Success payload, or 400/404/500 mapped per outcome.
 */
export async function handleAdminUpdateUser(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminUpdateUserBodySchema, async (context, body) => {
    const tier = matchUnion(AdminStore.LICENSE_TIERS, body.tier);
    if (body.tier !== undefined && tier === undefined) {
      return errorResponse('Invalid tier', 400);
    }
    const status = matchUnion(AdminStore.LICENSE_STATUSES, body.status);
    if (body.status !== undefined && status === undefined) {
      return errorResponse('Invalid status', 400);
    }

    const auditMetadata = { ...body };
    const exit = await Effect.runPromiseExit(
      AdminStore.updateUser(env.DB, {
        userId: body.userId,
        ...(tier !== undefined && { tier }),
        ...(status !== undefined && { status }),
      })
    );
    if (Exit.isFailure(exit)) {
      await logAdminAudit(env.DB, {
        action: 'admin.update_user',
        userId: context.user.id,
        request,
        metadata: auditMetadata,
        success: false,
      });
      return errorResponse('Failed to update user', 500);
    }
    if (exit.value._tag === 'customer-not-found') {
      await logAdminAudit(env.DB, {
        action: 'admin.update_user',
        userId: context.user.id,
        request,
        metadata: { ...auditMetadata, reason: 'customer_not_found' },
        success: false,
      });
      return errorResponse('Customer not found', 404);
    }
    await logAdminAudit(env.DB, {
      action: 'admin.update_user',
      userId: context.user.id,
      request,
      metadata: auditMetadata,
    });
    return secureJsonResponse({ success: true });
  });
}

/**
 * Load the latest admin activity events.
 *
 * @param request - Incoming GET with optional `page` and `limit`.
 * @param env - Worker bindings.
 * @returns The most recent activity rows, newest first.
 */
export async function handleAdminActivity(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const page = parsePage(url.searchParams.get('page'));
    const limit = parsePageSize(url.searchParams.get('limit'));
    return storeResponse(
      AdminStore.listActivity(env.DB, limit, (page - 1) * limit),
      storeFailure('Failed to load activity'),
      activity => secureJsonResponse({ request_id: context.requestId, activity })
    );
  });
}

/**
 * Probe database connectivity for the admin health panel.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns Overall status plus per-dependency connectivity flags.
 */
export async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, async () => {
    let db: 'connected' | 'unavailable' = 'connected';
    try {
      await env.DB.prepare('SELECT 1').first();
    } catch (error: unknown) {
      reportError('Admin health database probe failed', error);
      db = 'unavailable';
    }
    return secureJsonResponse({
      status: db === 'connected' ? 'ok' : 'degraded',
      db,
    });
  });
}

/**
 * Export aggregate usage as CSV.
 *
 * Audited: bulk data access is recorded before streaming.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns CSV attachment of daily usage rows (capped at 1000).
 */
export async function handleAdminExportUsage(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(AdminStore.exportUsage(env.DB), storeFailure('Failed to export usage'), usage => {
      const response = csvResponse(
        'usage.csv',
        ['date', 'license_id', 'commands_run', 'time_saved_ms'],
        usage.map(row => [row.date, row.license_id, row.commands_run, row.time_saved_ms])
      );
      return logAdminAudit(env.DB, {
        action: 'admin.export_usage',
        userId: context.user.id,
        request,
        metadata: { rows: usage.length },
      }).then(() => response);
    })
  );
}

/**
 * Export the admin audit trail as CSV.
 *
 * Audited: bulk data access is recorded before streaming.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns CSV attachment of audit rows (capped at 1000).
 */
export async function handleAdminExportAudit(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(
      AdminStore.exportAudit(env.DB),
      storeFailure('Failed to export audit log'),
      logs => {
        const response = csvResponse(
          'audit.csv',
          ['created_at', 'action', 'customer_id', 'ip_address'],
          logs.map(row => [row.created_at, row.action, row.customer_id, row.ip_address])
        );
        return logAdminAudit(env.DB, {
          action: 'admin.export_audit',
          userId: context.user.id,
          request,
          metadata: { rows: logs.length },
        }).then(() => response);
      }
    )
  );
}

/**
 * Load product, growth, performance, and usage analytics.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns Computed analytics payload including real week-over-week growth.
 */
export async function handleAdminAnalytics(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(
      AdminStore.loadAnalytics(env.DB),
      storeFailure('Failed to load analytics'),
      data =>
        secureJsonResponse({
          request_id: context.requestId,
          commands_by_type: data.commandsByType,
          errors_by_type: data.errorsByType,
          growth: {
            new_users_7d: numberOrZero(data.growth?.new_users_7d),
            new_paid_7d: numberOrZero(data.growth?.new_paid_7d),
            growth_rate: numberOrZero(data.growthRate?.rate),
          },
          time_saved: { total_hours: numberOrZero(data.timeSaved?.total_hours) },
          funnel: {
            installs: numberOrZero(data.funnel?.installs),
            activated: numberOrZero(data.funnel?.activated),
            power_users: numberOrZero(data.funnel?.power_users),
          },
          churn_risk: { at_risk_users: numberOrZero(data.churnRisk?.at_risk_users) },
          retention_rate: numberOrZero(data.retentionRate?.rate),
          performance: {
            avg_latency_ms: numberOrZero(data.performance?.avg_ms),
            min_ms: numberOrZero(data.performance?.min_ms),
            max_ms: numberOrZero(data.performance?.max_ms),
            query_count: numberOrZero(data.performance?.count),
          },
          sessions: {
            total_30d: numberOrZero(data.sessions?.total_sessions),
            sessions_started: numberOrZero(data.sessions?.sessions_started),
            heartbeats_sent: numberOrZero(data.sessions?.heartbeats_sent),
            avg_duration_seconds: numberOrZero(data.sessions?.avg_duration_seconds),
            max_duration_seconds: numberOrZero(data.sessions?.max_duration_seconds),
          },
          user_journey: {
            funnel: {
              installed: numberOrZero(data.userJourney?.installed),
              activated: numberOrZero(data.userJourney?.activated),
              first_command: numberOrZero(data.userJourney?.first_command),
              exploring: numberOrZero(data.userJourney?.exploring),
              engaged: numberOrZero(data.userJourney?.engaged),
              power_user: numberOrZero(data.userJourney?.power_user),
            },
          },
          runtime_usage: data.runtimeUsage,
        })
    )
  );
}

/**
 * Load monthly signup/activity retention cohorts.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns Cohort month/index pairs with active-user counts.
 */
export async function handleAdminCohorts(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(AdminStore.listCohorts(env.DB), storeFailure('Failed to load cohorts'), cohorts =>
      secureJsonResponse({ request_id: context.requestId, cohorts })
    )
  );
}

/**
 * Load revenue history, MRR, and ARR.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns Monthly revenue, per-tier revenue, MRR, and projected ARR.
 */
export async function handleAdminRevenue(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(AdminStore.loadRevenue(env.DB), storeFailure('Failed to load revenue'), data => {
      const mrr = computeMrr(data.mrrTiers);
      return secureJsonResponse({
        request_id: context.requestId,
        mrr,
        arr: mrr * 12,
        monthly_revenue: data.monthly,
        revenue_by_tier: data.byTier,
      });
    })
  );
}

/**
 * Export the full customer roster as CSV.
 *
 * Audited: this is a bulk PII export (emails, companies, tiers) and is recorded
 * with its row count before streaming.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns CSV attachment of customer rows (capped at 1000).
 */
export async function handleAdminExportUsers(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(AdminStore.exportUsers(env.DB), storeFailure('Failed to export users'), users => {
      const response = csvResponse(
        'omg-users.csv',
        [
          'id',
          'email',
          'company',
          'created_at',
          'tier',
          'status',
          'active_machines',
          'total_commands',
        ],
        users.map(row => [
          row.id,
          row.email,
          row.company,
          row.created_at,
          row.tier,
          row.status,
          row.active_machines,
          row.total_commands,
        ])
      );
      return logAdminAudit(env.DB, {
        action: 'admin.export_users',
        userId: context.user.id,
        request,
        resourceType: 'customer',
        metadata: { rows: users.length },
      }).then(() => response);
    })
  );
}

/**
 * Load one page of the enriched admin audit log.
 *
 * @param request - Incoming GET with `page` and `limit`.
 * @param env - Worker bindings.
 * @returns Audit rows plus `{ page, limit, total, pages }`.
 */
export async function handleAdminAuditLog(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const page = parsePage(url.searchParams.get('page'));
    const limit = parsePageSize(url.searchParams.get('limit'));
    return storeResponse(
      AdminStore.listAuditLog(env.DB, limit, (page - 1) * limit),
      storeFailure('Failed to load audit log'),
      ({ logs, total }) =>
        secureJsonResponse({
          request_id: context.requestId,
          logs,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        })
    );
  });
}

/**
 * Load advanced engagement, retention, adoption, and revenue metrics.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns Computed advanced-metrics payload including real expansion figures.
 */
export async function handleAdminAdvancedMetrics(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(
      AdminStore.loadAdvancedMetrics(env.DB),
      storeFailure('Failed to load advanced metrics'),
      data => {
        const denominator = data.mau.count === 0 ? 1 : data.mau.count;
        const currentMrr = data.revenue.current_mrr;
        return secureJsonResponse({
          request_id: context.requestId,
          engagement: {
            dau: data.dau.count,
            wau: data.wau.count,
            mau: data.mau.count,
            stickiness: {
              daily_to_monthly: `${((data.dau.count / denominator) * 100).toFixed(1)}%`,
              weekly_to_monthly: `${((data.wau.count / denominator) * 100).toFixed(1)}%`,
            },
          },
          retention: { cohorts: data.retention },
          ltv_by_tier: data.ltvByTier,
          feature_adoption: data.adoption,
          command_heatmap: data.heatmap,
          runtime_adoption: data.runtimeRows,
          churn_risk_segments: data.churn,
          expansion_opportunities: data.expansion,
          time_to_value: data.timeToValue,
          revenue_metrics: {
            current_mrr: currentMrr,
            projected_arr: currentMrr * 12,
            expansion_mrr_12m: numberOrZero(data.expansionMrr?.rate),
          },
        });
      }
    )
  );
}

/**
 * List CRM notes for one customer.
 *
 * @param request - Incoming GET with required `customerId` query parameter.
 * @param env - Worker bindings.
 * @returns The customer's notes, or 400 when the id is missing.
 */
export async function handleAdminGetNotes(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const customerId = url.searchParams.get('customerId');
    if (customerId === null || customerId.length === 0) {
      return errorResponse('Customer ID required', 400);
    }
    return storeResponse(
      listNotes(env.DB, customerId),
      storeFailure('Failed to load notes'),
      notes => secureJsonResponse({ request_id: context.requestId, notes })
    );
  });
}

/**
 * Create a CRM note for a customer and audit it.
 *
 * @param request - Incoming POST with note fields.
 * @param env - Worker bindings.
 * @returns Success payload with the new note id.
 */
export async function handleAdminCreateNote(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminCreateNoteBodySchema, async (context, body) => {
    const noteType = body.noteType || 'general';
    return storeResponse(
      createNote(env.DB, {
        customerId: body.customerId,
        content: body.content,
        noteType,
        authorId: context.user.id,
      }),
      storeFailure('Failed to create note'),
      async noteId => {
        await logAdminAudit(env.DB, {
          action: 'admin.note_created',
          userId: context.user.id,
          request,
          resourceType: 'customer_note',
          resourceId: noteId,
          metadata: { customer_id: body.customerId, note_type: noteType },
        });
        return secureJsonResponse({
          request_id: context.requestId,
          success: true,
          note_id: noteId,
        });
      }
    );
  });
}

/**
 * Update a CRM note and audit it.
 *
 * @param request - Incoming POST with note id and updated fields.
 * @param env - Worker bindings.
 * @returns Success payload.
 */
export async function handleAdminUpdateNote(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminUpdateNoteBodySchema, async (context, body) => {
    return storeResponse(
      updateNote(env.DB, {
        noteId: body.noteId,
        ...(body.content !== undefined && { content: body.content }),
        ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
      }),
      storeFailure('Failed to update note'),
      async () => {
        await logAdminAudit(env.DB, {
          action: 'admin.note_updated',
          userId: context.user.id,
          request,
          resourceType: 'customer_note',
          resourceId: body.noteId,
          metadata: { updated_fields: Object.keys(body).filter(key => key !== 'noteId') },
        });
        return secureJsonResponse({ request_id: context.requestId, success: true });
      }
    );
  });
}

/**
 * Delete a CRM note and audit it.
 *
 * @param request - Incoming GET-style DELETE with required `noteId` query parameter.
 * @param env - Worker bindings.
 * @returns Success payload, or 400 when the id is missing.
 */
export async function handleAdminDeleteNote(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const noteId = url.searchParams.get('noteId');
    if (noteId === null || noteId.length === 0) {
      return errorResponse('Note ID required', 400);
    }
    return storeResponse(
      deleteNote(env.DB, noteId),
      storeFailure('Failed to delete note'),
      async () => {
        await logAdminAudit(env.DB, {
          action: 'admin.note_deleted',
          userId: context.user.id,
          request,
          resourceType: 'customer_note',
          resourceId: noteId,
        });
        return secureJsonResponse({ request_id: context.requestId, success: true });
      }
    );
  });
}

/**
 * List the tag catalog.
 *
 * @param request - Incoming GET request.
 * @param env - Worker bindings.
 * @returns All defined tags.
 */
export async function handleAdminGetTags(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, async context => {
    return storeResponse(listTagCatalog(env.DB), storeFailure('Failed to load tags'), tags =>
      secureJsonResponse({ request_id: context.requestId, tags })
    );
  });
}

/**
 * List tags assigned to one customer.
 *
 * @param request - Incoming GET with required `customerId` query parameter.
 * @param env - Worker bindings.
 * @returns The customer's tag assignments, or 400 when the id is missing.
 */
export async function handleAdminGetCustomerTags(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const customerId = url.searchParams.get('customerId');
    if (customerId === null || customerId.length === 0) {
      return errorResponse('Customer ID required', 400);
    }
    return storeResponse(
      listCustomerTags(env.DB, customerId),
      storeFailure('Failed to load customer tags'),
      tags => secureJsonResponse({ request_id: context.requestId, tags })
    );
  });
}

/**
 * Create a catalog tag and audit it.
 *
 * @param request - Incoming POST with tag fields.
 * @param env - Worker bindings.
 * @returns Success payload with the new tag id.
 */
export async function handleAdminCreateTag(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminCreateTagBodySchema, async (context, body) => {
    return storeResponse(
      createTag(env.DB, {
        name: body.name,
        ...(body.color !== undefined && { color: body.color }),
        ...(body.description !== undefined && { description: body.description }),
      }),
      storeFailure('Failed to create tag'),
      async tagId => {
        await logAdminAudit(env.DB, {
          action: 'admin.tag_created',
          userId: context.user.id,
          request,
          resourceType: 'customer_tag',
          resourceId: tagId,
          metadata: { name: body.name, color: body.color ?? '#6366f1' },
        });
        return secureJsonResponse({ request_id: context.requestId, success: true, tag_id: tagId });
      }
    );
  });
}

/**
 * Assign a tag to a customer and audit it.
 *
 * Already-assigned pairs succeed without a duplicate audit row since no state
 * changed.
 *
 * @param request - Incoming POST with customer/tag ids.
 * @param env - Worker bindings.
 * @returns Success payload.
 */
export async function handleAdminAssignTag(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminAssignTagBodySchema, async (context, body) => {
    return storeResponse(
      assignTag(env.DB, {
        customerId: body.customerId,
        tagId: body.tagId,
        assignedBy: context.user.id,
      }),
      storeFailure('Failed to assign tag'),
      async assignment => {
        if (assignment === 'already-assigned') {
          return secureJsonResponse({
            request_id: context.requestId,
            success: true,
            message: 'Tag already assigned',
          });
        }
        await logAdminAudit(env.DB, {
          action: 'admin.tag_assigned',
          userId: context.user.id,
          request,
          resourceType: 'customer_tag_assignment',
          metadata: { customer_id: body.customerId, tag_id: body.tagId },
        });
        return secureJsonResponse({ request_id: context.requestId, success: true });
      }
    );
  });
}

/**
 * Remove a tag assignment and audit it.
 *
 * @param request - Incoming DELETE with required `customerId` and `tagId` parameters.
 * @param env - Worker bindings.
 * @returns Success payload, or 400 when ids are missing.
 */
export async function handleAdminRemoveTag(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const customerId = url.searchParams.get('customerId');
    const tagId = url.searchParams.get('tagId');
    if (customerId === null || customerId.length === 0 || tagId === null || tagId.length === 0) {
      return errorResponse('Customer ID and Tag ID required', 400);
    }
    return storeResponse(
      removeTag(env.DB, customerId, tagId),
      storeFailure('Failed to remove tag'),
      async () => {
        await logAdminAudit(env.DB, {
          action: 'admin.tag_removed',
          userId: context.user.id,
          request,
          resourceType: 'customer_tag_assignment',
          metadata: { customer_id: customerId, tag_id: tagId },
        });
        return secureJsonResponse({ request_id: context.requestId, success: true });
      }
    );
  });
}

/**
 * Load one customer's computed health score.
 *
 * @param request - Incoming GET with required `customerId` query parameter.
 * @param env - Worker bindings.
 * @returns The health score payload, or 400/404 when missing or unknown.
 */
export async function handleAdminGetCustomerHealth(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const customerId = url.searchParams.get('customerId');
    if (customerId === null || customerId.length === 0) {
      return Promise.resolve(errorResponse('Customer ID required', 400));
    }
    return storeResponse(
      AdminStore.getCustomerHealth(env.DB, customerId),
      storeFailure('Failed to load customer health'),
      health =>
        health === undefined
          ? errorResponse('Customer health not found', 404)
          : secureJsonResponse({ request_id: context.requestId, health })
    );
  });
}
