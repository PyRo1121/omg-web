/** Admin HTTP handlers. Persistence lives in the admin and CRM stores. */
import { Effect, type Schema } from 'effect';

import { type Env, errorResponse, getAuthToken, jsonResponse, validateSession } from '../api';
import { decodeJsonBody } from '../body';
import {
  AdminAssignTagBodySchema,
  AdminCreateNoteBodySchema,
  AdminCreateTagBodySchema,
  AdminUpdateNoteBodySchema,
  AdminUpdateUserBodySchema,
} from '../contracts/http-bodies';
import { ExtraRowParseError } from '../contracts/d1-extras';
import { reportError } from '../observability';
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
  'X-XSS-Protection': '1; mode=block',
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

function parsePaginationParam(raw: string | null, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

const TIER_PRICES = new Map([
  ['pro', 9],
  ['team', 200],
  ['enterprise', 500],
]);

function computeMrr(
  rows: ReadonlyArray<{ readonly tier: string; readonly count: number }>
): number {
  return rows.reduce((mrr, row) => mrr + (TIER_PRICES.get(row.tier) ?? 0) * row.count, 0);
}

const numberOrZero = (value: number | null | undefined): number => value || 0;

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
    reportError('Admin audit log error', error);
  }
}

async function validateAdmin(
  request: Request,
  env: Env
): Promise<{ readonly context: AdminContext } | { readonly error: Response }> {
  const token = getAuthToken(request);
  if (!token) return { error: errorResponse('Unauthorized', 401) };
  const auth = await validateSession(env.DB, token);
  if (!auth) return { error: errorResponse('Invalid or expired session', 401) };

  if (!(await Effect.runPromise(AdminStore.isAdmin(env.DB, auth.user.id)))) {
    await logAdminAudit(env.DB, {
      action: 'admin.unauthorized_access',
      userId: auth.user.id,
      request,
      metadata: { attempted_path: new URL(request.url).pathname },
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
  return withAdminContext(request, env, context => handler(context, new URL(request.url)));
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
  const result = await Effect.runPromise(
    effect.pipe(
      Effect.match({
        onFailure: error => ({ _tag: 'failure', error }) as const,
        onSuccess: value => ({ _tag: 'success', value }) as const,
      })
    )
  );
  if (result._tag === 'failure') {
    return errorResponse(failureMessage(result.error), 500);
  }
  return respond(result.value);
}

const storeFailure = (message: string) => () => message;

function escapeCSV<T>(value: T): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) || ['=', '+', '-', '@'].some(prefix => text.startsWith(prefix))
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function csvResponse(
  filename: string,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(
    [headers.join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n'),
    {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        ...extraHeaders,
      },
    }
  );
}

export async function handleAdminDashboard(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(
      AdminStore.loadDashboard(env.DB),
      storeFailure('Failed to load dashboard'),
      data => {
        const globalValueUSD = Math.round(
          ((data.globalUsage?.total_time_saved ?? 0) / (1000 * 60 * 60)) * 100
        );
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

export async function handleAdminCRMUsers(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const page = parsePaginationParam(url.searchParams.get('page'), 1);
    const limit = Math.min(parsePaginationParam(url.searchParams.get('limit'), 50), 100);
    return storeResponse(
      AdminStore.listUsers(env.DB, {
        search: url.searchParams.get('search') || '',
        limit,
        offset: (page - 1) * limit,
      }),
      storeFailure('Failed to load users'),
      users =>
        secureJsonResponse({ request_id: context.requestId, users, pagination: { page, limit } })
    );
  });
}

export async function handleAdminUserDetail(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const userId = url.searchParams.get('id');
    if (!userId) return Promise.resolve(errorResponse('User ID required'));
    return storeResponse(
      AdminStore.loadUserDetail(env.DB, userId),
      error => {
        if (!(error instanceof ExtraRowParseError)) return 'Failed to load user';
        if (error.reason.includes('license')) return 'Failed to load license';
        if (error.reason.includes('machine')) return 'Failed to load machines';
        if (error.reason.includes('usage')) return 'Failed to load usage';
        return 'Failed to load user';
      },
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

export async function handleAdminUpdateUser(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminUpdateUserBodySchema, async (context, body) => {
    await Effect.runPromise(
      AdminStore.updateUser(env.DB, {
        userId: body.userId,
        ...(body.tier !== undefined && { tier: body.tier }),
        ...(body.status !== undefined && { status: body.status }),
      })
    );
    await logAdminAudit(env.DB, {
      action: 'admin.update_user',
      userId: context.user.id,
      metadata: body,
    });
    return secureJsonResponse({ success: true });
  });
}

export async function handleAdminActivity(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(
      AdminStore.listActivity(env.DB),
      storeFailure('Failed to load activity'),
      activity => secureJsonResponse({ request_id: context.requestId, activity })
    )
  );
}

export async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, async () => {
    let db: 'connected' | 'unavailable' = 'connected';
    try {
      await env.DB.prepare('SELECT 1').first();
    } catch {
      db = 'unavailable';
    }
    return secureJsonResponse({
      status: db === 'connected' ? 'ok' : 'degraded',
      db,
      version: '1.0.0',
    });
  });
}

export async function handleAdminExportUsage(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, () =>
    storeResponse(AdminStore.exportUsage(env.DB), storeFailure('Failed to export usage'), usage =>
      csvResponse(
        'usage.csv',
        ['date', 'license_id', 'commands_run', 'time_saved_ms'],
        usage.map(row => [row.date, row.license_id, row.commands_run, row.time_saved_ms])
      )
    )
  );
}

export async function handleAdminExportAudit(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, () =>
    storeResponse(
      AdminStore.exportAudit(env.DB),
      storeFailure('Failed to export audit log'),
      logs =>
        csvResponse(
          'audit.csv',
          ['created_at', 'action', 'customer_id', 'ip_address'],
          logs.map(row => [row.created_at, row.action, row.customer_id, row.ip_address])
        )
    )
  );
}

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
            growth_rate: 15,
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

export async function handleAdminCohorts(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, context =>
    storeResponse(AdminStore.listCohorts(env.DB), storeFailure('Failed to load cohorts'), cohorts =>
      secureJsonResponse({ request_id: context.requestId, cohorts })
    )
  );
}

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

export async function handleAdminExportUsers(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, () =>
    storeResponse(AdminStore.exportUsers(env.DB), storeFailure('Failed to export users'), users =>
      csvResponse(
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
        ]),
        SECURITY_HEADERS
      )
    )
  );
}

export async function handleAdminAuditLog(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const page = parsePaginationParam(url.searchParams.get('page'), 1);
    const limit = Math.min(parsePaginationParam(url.searchParams.get('limit'), 50), 100);
    return storeResponse(
      AdminStore.listAuditLog(env.DB, limit, (page - 1) * limit),
      storeFailure('Failed to load audit log'),
      logs => secureJsonResponse({ request_id: context.requestId, logs })
    );
  });
}

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
            expansion_mrr_12m: 0,
          },
        });
      }
    )
  );
}

export async function handleAdminGetNotes(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) return errorResponse('Customer ID required', 400);
    const notes = await Effect.runPromise(listNotes(env.DB, customerId));
    return secureJsonResponse({ request_id: context.requestId, notes });
  });
}

export async function handleAdminCreateNote(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminCreateNoteBodySchema, async (context, body) => {
    const noteType = body.noteType || 'general';
    const noteId = await Effect.runPromise(
      createNote(env.DB, {
        customerId: body.customerId,
        content: body.content,
        noteType,
        authorId: context.user.id,
      })
    );
    await logAdminAudit(env.DB, {
      action: 'admin.note_created',
      userId: context.user.id,
      request,
      resourceType: 'customer_note',
      resourceId: noteId,
      metadata: { customer_id: body.customerId, note_type: noteType },
    });
    return secureJsonResponse({ request_id: context.requestId, success: true, note_id: noteId });
  });
}

export async function handleAdminUpdateNote(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminUpdateNoteBodySchema, async (context, body) => {
    await Effect.runPromise(
      updateNote(env.DB, {
        noteId: body.noteId,
        ...(body.content !== undefined && { content: body.content }),
        ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
      })
    );
    await logAdminAudit(env.DB, {
      action: 'admin.note_updated',
      userId: context.user.id,
      request,
      resourceType: 'customer_note',
      resourceId: body.noteId,
      metadata: { updated_fields: Object.keys(body).filter(key => key !== 'noteId') },
    });
    return secureJsonResponse({ request_id: context.requestId, success: true });
  });
}

export async function handleAdminDeleteNote(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const noteId = url.searchParams.get('noteId');
    if (!noteId) return errorResponse('Note ID required', 400);
    await Effect.runPromise(deleteNote(env.DB, noteId));
    await logAdminAudit(env.DB, {
      action: 'admin.note_deleted',
      userId: context.user.id,
      request,
      resourceType: 'customer_note',
      resourceId: noteId,
    });
    return secureJsonResponse({ request_id: context.requestId, success: true });
  });
}

export async function handleAdminGetTags(request: Request, env: Env): Promise<Response> {
  return withAdminContext(request, env, async context => {
    const tags = await Effect.runPromise(listTagCatalog(env.DB));
    return secureJsonResponse({ request_id: context.requestId, tags });
  });
}

export async function handleAdminGetCustomerTags(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) return errorResponse('Customer ID required', 400);
    const tags = await Effect.runPromise(listCustomerTags(env.DB, customerId));
    return secureJsonResponse({ request_id: context.requestId, tags });
  });
}

export async function handleAdminCreateTag(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminCreateTagBodySchema, async (context, body) => {
    const tagId = await Effect.runPromise(
      createTag(env.DB, {
        name: body.name,
        ...(body.color !== undefined && { color: body.color }),
        ...(body.description !== undefined && { description: body.description }),
      })
    );
    await logAdminAudit(env.DB, {
      action: 'admin.tag_created',
      userId: context.user.id,
      request,
      resourceType: 'customer_tag',
      resourceId: tagId,
      metadata: { name: body.name, color: body.color ?? '#6366f1' },
    });
    return secureJsonResponse({ request_id: context.requestId, success: true, tag_id: tagId });
  });
}

export async function handleAdminAssignTag(request: Request, env: Env): Promise<Response> {
  return withAdminBody(request, env, AdminAssignTagBodySchema, async (context, body) => {
    const assignment = await Effect.runPromise(
      assignTag(env.DB, {
        customerId: body.customerId,
        tagId: body.tagId,
        assignedBy: context.user.id,
      })
    );
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
  });
}

export async function handleAdminRemoveTag(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, async (context, url) => {
    const customerId = url.searchParams.get('customerId');
    const tagId = url.searchParams.get('tagId');
    if (!customerId || !tagId) return errorResponse('Customer ID and Tag ID required', 400);
    await Effect.runPromise(removeTag(env.DB, customerId, tagId));
    await logAdminAudit(env.DB, {
      action: 'admin.tag_removed',
      userId: context.user.id,
      request,
      resourceType: 'customer_tag_assignment',
      metadata: { customer_id: customerId, tag_id: tagId },
    });
    return secureJsonResponse({ request_id: context.requestId, success: true });
  });
}

export async function handleAdminGetCustomerHealth(request: Request, env: Env): Promise<Response> {
  return withAdminQuery(request, env, (context, url) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) return Promise.resolve(errorResponse('Customer ID required', 400));
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
