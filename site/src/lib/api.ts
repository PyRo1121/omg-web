// API client for the same-origin licensing BFF and public site analytics.

import { Cause, Effect, Exit, Option } from 'effect';
import type * as Schema from 'effect/Schema';
import { ApiError } from './api-error';
import { casesHandled } from './prelude';
import {
  browserWorkerFetcher,
  requestDecodedJson,
  requestText,
  type WorkerApiFailure,
} from './worker-api';
import * as Http from './contracts/worker-http';
import { LicensingRoutes } from '../../shared/licensing-routes';
import {
  MarketingOfferResponseSchema,
  type MarketingOfferResponse,
  type MarketingPromotionCode,
} from '../../shared/marketing-offer';

type WorkerBody<S extends Schema.Schema.AnyNoContext> = Schema.Schema.Type<S>;

const LICENSING_BFF_BASE = '/api/licensing';

/**
 * Runs a typed Worker request and collapses its classified failure channel
 * into thrown {@link ApiError} exceptions. This is the single seam where the
 * Effect error channel becomes an exception: TanStack Query (the only caller
 * layer) classifies failures via `instanceof ApiError` in query.ts; every
 * module below this seam stays errors-as-values.
 */
async function runWorkerRequest<A>(effect: Effect.Effect<A, WorkerApiFailure>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  return Exit.match(exit, {
    onSuccess: value => value,
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        throw new ApiError('Request failed', 500);
      }
      const error = failure.value;
      switch (error._tag) {
        case 'WorkerApiHttpError':
          throw new ApiError(error.message, error.status);
        case 'WorkerApiNetworkError':
          throw new ApiError('Request failed', 500);
        case 'WorkerHttpParseError':
          throw new ApiError(error.reason, 502);
        default:
          return casesHandled(error);
      }
    },
  });
}

// Authenticated same-origin BFF request with Schema decode at the boundary.
// Keep this prefix in sync with BFF_PATH_PREFIX in lib/licensing-bff.ts,
// which enforces the same allowlist server-side.
async function apiRequest<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  endpoint: string,
  options: RequestInit = {}
): Promise<Schema.Schema.Type<S>> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return runWorkerRequest(
    requestDecodedJson(
      browserWorkerFetcher,
      `${LICENSING_BFF_BASE}${endpoint}`,
      { ...options, headers },
      schema,
      `Worker response for ${endpoint} has an invalid shape`
    )
  );
}

/**
 * Builds `<path>?<search>` from ordered key/value entries. Entries guarded by
 * the caller with a ternary (`cond && ['key', value]`) are skipped when absent,
 * mirroring the previous per-call-site `URLSearchParams` construction.
 */
function withQuery(
  path: string,
  ...entries: ReadonlyArray<readonly [string, string] | undefined>
): string {
  const searchParams = new URLSearchParams();
  for (const entry of entries) {
    if (entry !== undefined) {
      searchParams.set(entry[0], entry[1]);
    }
  }
  return `${path}?${searchParams}`;
}

/** Claim a marketing offer through the same-origin public BFF. */
export async function claimMarketingOffer(email: string): Promise<MarketingOfferResponse> {
  return runWorkerRequest(
    requestDecodedJson(
      browserWorkerFetcher,
      '/api/offer',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
      MarketingOfferResponseSchema,
      'Marketing offer response has an invalid shape'
    )
  );
}

// ==== Account API ====

export async function getAdminUsers(page = 1, limit = 50, search = '') {
  return apiRequest(
    Http.AdminUsersResponseSchema,
    withQuery(
      LicensingRoutes.adminUsers.path,
      ['page', page.toString()],
      ['limit', limit.toString()],
      search ? ['search', search] : undefined
    )
  );
}

export const getAdminUserDetail = (userId: string) =>
  apiRequest(
    Http.AdminUserDetailSchema,
    withQuery(LicensingRoutes.adminUserGet.path, ['id', userId])
  );

export const getAdminCohorts = () =>
  apiRequest(Http.AdminCohortsSchema, LicensingRoutes.adminCohorts.path);

export const getAdminRevenue = () =>
  apiRequest(Http.AdminRevenueSchema, LicensingRoutes.adminRevenue.path);

export function getAdminAuditLog(page = 1, limit = 50, action = '') {
  return apiRequest(
    Http.AdminAuditLogResponseSchema,
    withQuery(
      LicensingRoutes.adminAuditLog.path,
      ['page', page.toString()],
      ['limit', limit.toString()],
      action ? ['action', action] : undefined
    )
  );
}

export const getAdminNotes = (customerId: string) =>
  apiRequest(
    Http.NotesResponseSchema,
    withQuery(LicensingRoutes.adminNotesGet.path, ['customerId', customerId])
  );

export const createAdminNote = (customerId: string, content: string, noteType = 'general') =>
  apiRequest(Http.CreatedNoteSchema, LicensingRoutes.adminNotesCreate.path, {
    method: 'POST',
    body: JSON.stringify({ customerId, content, noteType }),
  });

export const deleteAdminNote = (noteId: string): Promise<{ success: boolean }> =>
  apiRequest(
    Http.SuccessSchema,
    withQuery(LicensingRoutes.adminNotesDelete.path, ['noteId', noteId]),
    {
      method: 'DELETE',
    }
  );

export const getAdminTags = () =>
  apiRequest(Http.TagsResponseSchema, LicensingRoutes.adminTagsGet.path);

export const createAdminTag = (name: string, color?: string, description?: string) =>
  apiRequest(Http.CreatedTagSchema, LicensingRoutes.adminTagsCreate.path, {
    method: 'POST',
    body: JSON.stringify({ name, color, description }),
  });

export const getAdminCustomerTags = (customerId: string) =>
  apiRequest(
    Http.TagsResponseSchema,
    `${LicensingRoutes.adminCustomerTagsGet.path}?customerId=${customerId}`
  );

export const assignAdminTag = (customerId: string, tagId: string): Promise<{ success: boolean }> =>
  apiRequest(Http.SuccessSchema, LicensingRoutes.adminCustomerTagsAssign.path, {
    method: 'POST',
    body: JSON.stringify({ customerId, tagId }),
  });

export const removeAdminTag = (customerId: string, tagId: string): Promise<{ success: boolean }> =>
  apiRequest(
    Http.SuccessSchema,
    withQuery(
      LicensingRoutes.adminCustomerTagsRemove.path,
      ['customerId', customerId],
      ['tagId', tagId]
    ),
    { method: 'DELETE' }
  );

export type AdminUser = WorkerBody<typeof Http.AdminUsersResponseSchema>['users'][number];

export const getAdminFirehose = (limit = 50) =>
  apiRequest(
    Http.FirehoseResponseSchema,
    withQuery(LicensingRoutes.adminFirehose.path, ['limit', limit.toString()])
  );

// Advanced Metrics API
export const getAdminAdvancedMetrics = (): Promise<AdminAdvancedMetrics> =>
  apiRequest(Http.AdminAdvancedMetricsSchema, LicensingRoutes.adminAdvancedMetrics.path);

// Data Export - Fetch CSV data directly

/** Fetches a BFF CSV export as raw text through the same allowlisted boundary as JSON calls. */
async function fetchCsv(pathWithQuery: string, failureMessage: string): Promise<string> {
  const exit = await Effect.runPromiseExit(
    requestText(browserWorkerFetcher, `${LICENSING_BFF_BASE}${pathWithQuery}`)
  );
  return Exit.match(exit, {
    onSuccess: text => text,
    onFailure: cause => {
      const failure = Cause.failureOption(cause);
      if (Option.isNone(failure)) {
        throw new ApiError('Request failed', 500);
      }
      throw failure.value._tag === 'WorkerApiHttpError'
        ? new ApiError(failureMessage, failure.value.status)
        : new ApiError('Request failed', 500);
    },
  });
}

export const exportAdminUsers = (): Promise<string> =>
  fetchCsv(LicensingRoutes.adminExportUsers.path, 'Failed to export users');

export const exportAdminUsage = (days = 30): Promise<string> =>
  fetchCsv(
    withQuery(LicensingRoutes.adminExportUsage.path, ['days', days.toString()]),
    'Failed to export usage'
  );

export const exportAdminAudit = (days = 30): Promise<string> =>
  fetchCsv(
    withQuery(LicensingRoutes.adminExportAudit.path, ['days', days.toString()]),
    'Failed to audit log'
  );

// Helper function to trigger CSV download in browser
export function downloadCSV(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.insertAdjacentElement('beforeend', link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==== Docs Analytics API ====

export type DocsAnalyticsDashboard = WorkerBody<typeof Http.DocsAnalyticsDashboardSchema>;

export const getDocsAnalytics = (days = 30): Promise<DocsAnalyticsDashboard> =>
  apiRequest(
    Http.DocsAnalyticsDashboardSchema,
    withQuery(LicensingRoutes.docsAnalyticsDashboard.path, ['days', days.toString()])
  );

// ==== Site Analytics API ====

export type SiteGeoAnalytics = WorkerBody<typeof Http.SiteGeoAnalyticsSchema>;
export type SiteRealtimeAnalytics = WorkerBody<typeof Http.SiteRealtimeAnalyticsSchema>;
export type SiteAnalyticsOverview = WorkerBody<typeof Http.SiteAnalyticsOverviewSchema>;

export const getSiteGeoAnalytics = (days = 30): Promise<SiteGeoAnalytics> =>
  apiRequest(
    Http.SiteGeoAnalyticsSchema,
    withQuery(LicensingRoutes.siteAnalyticsGeo.path, ['days', days.toString()])
  );

export const getSiteRealtimeAnalytics = (): Promise<SiteRealtimeAnalytics> =>
  apiRequest(Http.SiteRealtimeAnalyticsSchema, LicensingRoutes.siteAnalyticsRealtime.path);

export const getSiteAnalyticsOverview = (days = 30): Promise<SiteAnalyticsOverview> =>
  apiRequest(
    Http.SiteAnalyticsOverviewSchema,
    withQuery(LicensingRoutes.siteAnalyticsOverview.path, ['days', days.toString()])
  );

// ==== Helpers ====

export function formatTimeSaved(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}min`;
  }
  if (ms < 86400000) {
    return `${(ms / 3600000).toFixed(1)}hr`;
  }
  return `${(ms / 86400000).toFixed(1)} days`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return 'N/A';
  }
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return formatDate(dateStr);
}

export function getTierBadgeColor(tier: string): string {
  switch (tier) {
    case 'pro':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    case 'team':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'enterprise':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    default:
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  }
}

export const openAdminBillingPortal = (
  email: string
): Promise<WorkerBody<typeof Http.PortalUrlSchema>> =>
  apiRequest(Http.PortalUrlSchema, LicensingRoutes.billingPortal.path, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const createCheckout = (
  offer: 'pro' | 'team',
  promotionCode?: MarketingPromotionCode
): Promise<{ url: string }> =>
  apiRequest(Http.CheckoutUrlSchema, LicensingRoutes.billingCheckout.path, {
    method: 'POST',
    body: JSON.stringify(promotionCode === undefined ? { offer } : { offer, promotionCode }),
  });

export type AdminOverview = WorkerBody<typeof Http.AdminOverviewSchema>;
export type AdminAdvancedMetrics = WorkerBody<typeof Http.AdminAdvancedMetricsSchema>;

export const getAdminDashboard = (): Promise<AdminOverview> =>
  apiRequest(Http.AdminOverviewSchema, LicensingRoutes.adminDashboard.path);

export function getStripeCustomerUrl(stripeCustomerId: string): string | null {
  if (!/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)) {
    return null;
  }
  return `https://dashboard.stripe.com/customers/${stripeCustomerId}`;
}
