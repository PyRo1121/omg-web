// API client for the same-origin licensing BFF and public site analytics.

import { Cause, Effect, Exit, Option } from 'effect';
import type * as Schema from 'effect/Schema';
import { casesHandled } from './prelude';
import { browserWorkerFetcher, requestDecodedJson, type WorkerApiError } from './worker-api';
import * as Http from './contracts/worker-http';
import { LicensingRoutes } from '../../shared/licensing-routes';

type WorkerBody<S extends Schema.Schema.AnyNoContext> = Schema.Schema.Type<S>;

const LICENSING_BFF_BASE = '/api/licensing';

// Authenticated same-origin BFF request with Schema decode at the boundary
async function apiRequest<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  endpoint: string,
  options: RequestInit = {}
): Promise<Schema.Schema.Type<S>> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const exit = await Effect.runPromiseExit(
    requestDecodedJson(
      browserWorkerFetcher,
      `${LICENSING_BFF_BASE}${endpoint}`,
      { ...options, headers },
      schema,
      `Worker response for ${endpoint} has an invalid shape`
    )
  );
  return unwrapWorkerApi(exit);
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

// Custom error class
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function unwrapWorkerApi<A>(exit: Exit.Exit<A, WorkerApiError>): A {
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

// ==== Account API ====

export async function getAdminUsers(
  page = 1,
  limit = 50,
  search = ''
): Promise<AdminUsersResponse> {
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

export const getAdminUserDetail = (userId: string): Promise<AdminUserDetail> =>
  apiRequest(Http.AdminUserDetailSchema, `${LicensingRoutes.adminUserGet.path}?id=${userId}`);

export const getAdminActivity = (): Promise<AdminActivityResponse> =>
  apiRequest(Http.AdminActivityResponseSchema, LicensingRoutes.adminActivity.path);

export const getAdminCohorts = (): Promise<AdminCohorts> =>
  apiRequest(Http.AdminCohortsSchema, LicensingRoutes.adminCohorts.path);

export const getAdminRevenue = (): Promise<AdminRevenue> =>
  apiRequest(Http.AdminRevenueSchema, LicensingRoutes.adminRevenue.path);

export async function getAdminAuditLog(
  page = 1,
  limit = 50,
  action = ''
): Promise<AdminAuditLogResponse> {
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

export const getAdminNotes = (customerId: string): Promise<NotesResponse> =>
  apiRequest(
    Http.NotesResponseSchema,
    `${LicensingRoutes.adminNotesGet.path}?customerId=${customerId}`
  );

export const createAdminNote = (
  customerId: string,
  content: string,
  noteType = 'general'
): Promise<WorkerBody<typeof Http.CreatedNoteSchema>> =>
  apiRequest(Http.CreatedNoteSchema, LicensingRoutes.adminNotesCreate.path, {
    method: 'POST',
    body: JSON.stringify({ customerId, content, noteType }),
  });

export const updateAdminNote = (
  noteId: string,
  updates: { content?: string | undefined; isPinned?: boolean | undefined }
): Promise<{ success: boolean }> =>
  apiRequest(Http.SuccessSchema, LicensingRoutes.adminNotesUpdate.path, {
    method: 'PUT',
    body: JSON.stringify({ noteId, ...updates }),
  });

export const deleteAdminNote = (noteId: string): Promise<{ success: boolean }> =>
  apiRequest(Http.SuccessSchema, `${LicensingRoutes.adminNotesDelete.path}?noteId=${noteId}`, {
    method: 'DELETE',
  });

export const getAdminTags = (): Promise<TagsResponse> =>
  apiRequest(Http.TagsResponseSchema, LicensingRoutes.adminTagsGet.path);

export const createAdminTag = (
  name: string,
  color?: string,
  description?: string
): Promise<WorkerBody<typeof Http.CreatedTagSchema>> =>
  apiRequest(Http.CreatedTagSchema, LicensingRoutes.adminTagsGet.path, {
    method: 'POST',
    body: JSON.stringify({ name, color, description }),
  });

export const getAdminCustomerTags = (customerId: string): Promise<TagsResponse> =>
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
    `${LicensingRoutes.adminCustomerTagsRemove.path}?customerId=${customerId}&tagId=${tagId}`,
    { method: 'DELETE' }
  );

export async function getAdminCustomerHealth(customerId: string): Promise<CustomerHealthResponse> {
  return apiRequest(
    Http.CustomerHealthResponseSchema,
    `${LicensingRoutes.adminCustomerHealth.path}?customerId=${customerId}`
  );
}

export type AdminUser = AdminUsersResponse['users'][number];
export type AdminUsersResponse = WorkerBody<typeof Http.AdminUsersResponseSchema>;
export type AdminUserDetail = WorkerBody<typeof Http.AdminUserDetailSchema>;
export type AdminActivityResponse = WorkerBody<typeof Http.AdminActivityResponseSchema>;
export type AdminCohorts = WorkerBody<typeof Http.AdminCohortsSchema>;
export type AdminRevenue = WorkerBody<typeof Http.AdminRevenueSchema>;
export type AdminAuditLogResponse = WorkerBody<typeof Http.AdminAuditLogResponseSchema>;
export type NotesResponse = WorkerBody<typeof Http.NotesResponseSchema>;
export type TagsResponse = WorkerBody<typeof Http.TagsResponseSchema>;
export type CustomerHealthResponse = WorkerBody<typeof Http.CustomerHealthResponseSchema>;

export const getAdminFirehose = (limit = 50): Promise<FirehoseResponse> =>
  apiRequest(Http.FirehoseResponseSchema, `${LicensingRoutes.adminFirehose.path}?limit=${limit}`);

export type FirehoseResponse = WorkerBody<typeof Http.FirehoseResponseSchema>;

// Advanced Metrics API
export const getAdminAdvancedMetrics = (): Promise<AdminAdvancedMetrics> =>
  apiRequest(Http.AdminAdvancedMetricsSchema, LicensingRoutes.adminAdvancedMetrics.path);

// Data Export - Fetch CSV data directly

/** Fetches a BFF CSV export as raw text, throwing the given message on non-2xx. */
const fetchCsv = (pathWithQuery: string, failureMessage: string): Promise<string> =>
  window.fetch(`${LICENSING_BFF_BASE}${pathWithQuery}`).then(response => {
    if (!response.ok) {
      throw new Error(failureMessage);
    }
    return response.text();
  });

export const exportAdminUsers = (): Promise<string> =>
  fetchCsv(LicensingRoutes.adminExportUsers.path, 'Failed to export users');

export const exportAdminUsage = (days = 30): Promise<string> =>
  fetchCsv(
    `${LicensingRoutes.adminExportUsage.path}?days=${encodeURIComponent(days)}`,
    'Failed to export usage'
  );

export const exportAdminAudit = (days = 30): Promise<string> =>
  fetchCsv(
    `${LicensingRoutes.adminExportAudit.path}?days=${encodeURIComponent(days)}`,
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
export type DocsAnalyticsSummary = DocsAnalyticsDashboard['summary'];
export type DocsPageview = DocsAnalyticsDashboard['pageviews_over_time'][number];
export type DocsTopPage = DocsAnalyticsDashboard['top_pages'][number];
export type DocsReferrer = DocsAnalyticsDashboard['top_referrers'][number];
export type DocsUTMCampaign = DocsAnalyticsDashboard['utm_campaigns'][number];
export type DocsGeo = DocsAnalyticsDashboard['geographic'][number];
export type DocsInteraction = DocsAnalyticsDashboard['top_interactions'][number];
export type DocsPerformance = DocsAnalyticsDashboard['performance'][number];

export const getDocsAnalytics = (days = 30): Promise<DocsAnalyticsDashboard> =>
  apiRequest(
    Http.DocsAnalyticsDashboardSchema,
    `${LicensingRoutes.docsAnalyticsDashboard.path}?days=${days}`
  );

// ==== Site Analytics API ====

export type SiteGeoAnalytics = WorkerBody<typeof Http.SiteGeoAnalyticsSchema>;
export type SiteGeoData = SiteGeoAnalytics['geo_distribution'][number];
export type SiteRealtimeAnalytics = WorkerBody<typeof Http.SiteRealtimeAnalyticsSchema>;
export type SiteAnalyticsOverview = WorkerBody<typeof Http.SiteAnalyticsOverviewSchema>;

export const getSiteGeoAnalytics = (days = 30): Promise<SiteGeoAnalytics> =>
  apiRequest(Http.SiteGeoAnalyticsSchema, `${LicensingRoutes.siteAnalyticsGeo.path}?days=${days}`);

export const getSiteRealtimeAnalytics = (): Promise<SiteRealtimeAnalytics> =>
  apiRequest(Http.SiteRealtimeAnalyticsSchema, LicensingRoutes.siteAnalyticsRealtime.path);

export const getSiteAnalyticsOverview = (days = 30): Promise<SiteAnalyticsOverview> =>
  apiRequest(
    Http.SiteAnalyticsOverviewSchema,
    `${LicensingRoutes.siteAnalyticsOverview.path}?days=${days}`
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
  const diffMs = now.getTime() - date.getTime();
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

export function getTierColor(tier: string): string {
  switch (tier) {
    case 'pro':
      return 'from-indigo-500 to-blue-500';
    case 'team':
      return 'from-purple-500 to-pink-500';
    case 'enterprise':
      return 'from-amber-500 to-orange-500';
    default:
      return 'from-emerald-500 to-teal-500';
  }
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

/** Public subscription offers accepted by the billing Worker. */

export type TeamData = WorkerBody<typeof Http.TeamDataSchema>;
export type PoliciesResponse = WorkerBody<typeof Http.PoliciesResponseSchema>;
export type NotificationsResponse = WorkerBody<typeof Http.NotificationsResponseSchema>;

export type BillingOffer = 'pro' | 'team';

export const createCheckout = (offer: BillingOffer): Promise<{ url: string }> =>
  apiRequest(Http.CheckoutUrlSchema, LicensingRoutes.billingCheckout.path, {
    method: 'POST',
    body: JSON.stringify({ offer }),
  });

export type AdminOverview = WorkerBody<typeof Http.AdminOverviewSchema>;
export type AdminAdvancedMetrics = WorkerBody<typeof Http.AdminAdvancedMetricsSchema>;

export const getAdminDashboard = (): Promise<AdminOverview> =>
  apiRequest(Http.AdminOverviewSchema, LicensingRoutes.adminDashboard.path);

export function getStripeCustomerUrl(stripeCustomerId: string): string {
  return `https://dashboard.stripe.com/customers/${stripeCustomerId}`;
}
