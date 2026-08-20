// API client for the same-origin licensing BFF and public site analytics.

import { Cause, Effect, Exit, Option } from 'effect';
import { casesHandled } from './prelude';
import { browserWorkerFetcher, requestDecodedJson, type WorkerApiError } from './worker-api';
import * as Http from './contracts/worker-http';
import type { Schema } from '@effect/schema';
import { LicensingRoutes } from '../../shared/licensing-routes';

type WorkerBody<S extends Schema.Schema.AnyNoContext> = Schema.Schema.Type<S>;

const PUBLIC_WORKER_BASE = 'https://api.pyro1121.com';
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

// Generic HTTP helpers
async function get<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  endpoint: string
): Promise<Schema.Schema.Type<S>> {
  return apiRequest(schema, endpoint, { method: 'GET' });
}

async function post<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  endpoint: string,
  body?: { readonly [key: string]: string | number | boolean | null | undefined }
): Promise<Schema.Schema.Type<S>> {
  const requestInit: RequestInit = { method: 'POST' };
  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }
  return apiRequest(schema, endpoint, requestInit);
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

// ============================================
// Dashboard API
// ============================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface License {
  id: string;
  license_key: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled' | 'expired';
  max_machines: number;
  expires_at: string | null;
  features: string[];
}

export interface Machine {
  id: string;
  machine_id: string;
  hostname: string | null;
  os: string | null;
  arch: string | null;
  omg_version: string | null;
  last_seen_at: string;
  first_seen_at: string;
  is_active: number;
}

export interface UsageStats {
  total_commands: number;
  total_packages_installed: number;
  total_packages_searched: number;
  total_runtimes_switched: number;
  total_sbom_generated: number;
  total_vulnerabilities_found: number;
  total_time_saved_ms: number;
  current_streak: number;
  longest_streak: number;
  daily: Array<{
    date: string;
    commands_run: number;
    time_saved_ms: number;
  }>;
}

export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlocked_at?: string;
}

export interface Subscription {
  status: string;
  current_period_end: string;
  cancel_at_period_end: number;
}

export interface Invoice {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
}

export type Session = WorkerBody<typeof Http.SessionsResponseSchema>['sessions'][number];

export type AuditLogEntry = WorkerBody<typeof Http.AuditLogResponseSchema>['logs'][number];

export interface DashboardData {
  user: User;
  license: License;
  machines: Machine[];
  usage: UsageStats;
  achievements: Achievement[];
  subscription: Subscription | null;
  invoices: Invoice[];
  is_admin?: boolean;
  global_stats?: {
    top_package: string;
    top_runtime: string;
    percentile: number;
  };
  leaderboard?: Array<{
    user: string;
    time_saved: number;
  }>;
}

export async function updateProfile(name: string): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.updateProfile.path, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function regenerateLicense(): Promise<
  WorkerBody<typeof Http.RegeneratedLicenseSchema>
> {
  return apiRequest(Http.RegeneratedLicenseSchema, LicensingRoutes.regenerateLicense.path, {
    method: 'POST',
  });
}

export async function revokeMachine(machineId: string): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.revokeMachine.path, {
    method: 'POST',
    body: JSON.stringify({ machine_id: machineId }),
  });
}

export async function getSessions(): Promise<WorkerBody<typeof Http.SessionsResponseSchema>> {
  return apiRequest(Http.SessionsResponseSchema, LicensingRoutes.sessions.path);
}

export async function revokeSession(sessionId: string): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.revokeSession.path, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function getAuditLog(): Promise<WorkerBody<typeof Http.AuditLogResponseSchema>> {
  return apiRequest(Http.AuditLogResponseSchema, LicensingRoutes.auditLog.path);
}

// ============================================
// Team Management API (Team+ tiers only)
// ============================================

export type TeamData = WorkerBody<typeof Http.TeamDataSchema>;
export type TeamMember = TeamData['members'][number];

export async function getTeamMembers(): Promise<TeamData> {
  return apiRequest(Http.TeamDataSchema, LicensingRoutes.teamMembers.path);
}

export async function revokeTeamMember(machineId: string): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.revokeTeamMember.path, {
    method: 'POST',
    body: JSON.stringify({ machine_id: machineId }),
  });
}

/** Public subscription offers accepted by the billing Worker. */
export type BillingOffer = 'pro' | 'team';

export async function createCheckout(offer: BillingOffer): Promise<{ url: string }> {
  return apiRequest(Http.CheckoutUrlSchema, LicensingRoutes.billingCheckout.path, {
    method: 'POST',
    body: JSON.stringify({ offer }),
  });
}

export async function openBillingPortal(email: string): Promise<{ success: boolean; url: string }> {
  return apiRequest(Http.PortalUrlSchema, LicensingRoutes.billingPortal.path, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ============================================
// Team Controls API (Team/Enterprise tiers)
// ============================================

export type PoliciesResponse = WorkerBody<typeof Http.PoliciesResponseSchema>;
export type NotificationsResponse = WorkerBody<typeof Http.NotificationsResponseSchema>;
export type TeamAuditLogsResponse = WorkerBody<typeof Http.TeamAuditLogsResponseSchema>;
export type TeamAuditLogEntry = TeamAuditLogsResponse['logs'][number];

export async function getTeamPolicies(): Promise<PoliciesResponse> {
  return apiRequest(Http.PoliciesResponseSchema, LicensingRoutes.teamPolicies.path);
}

export async function getNotificationSettings(): Promise<NotificationsResponse> {
  return apiRequest(Http.NotificationsResponseSchema, LicensingRoutes.teamNotifications.path);
}

export async function getTeamAuditLogs(params?: {
  limit?: number;
  offset?: number;
  action?: string;
  resource_type?: string;
}): Promise<TeamAuditLogsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params?.offset) {
    searchParams.set('offset', params.offset.toString());
  }
  if (params?.action) {
    searchParams.set('action', params.action);
  }
  if (params?.resource_type) {
    searchParams.set('resource_type', params.resource_type);
  }
  return apiRequest(
    Http.TeamAuditLogsResponseSchema,
    `${LicensingRoutes.teamAuditLogs.path}?${searchParams}`
  );
}

// ============================================
// Admin API (only accessible to admin user)
// ============================================

export type AdminOverview = WorkerBody<typeof Http.AdminOverviewSchema>;
export type AdminUsersResponse = WorkerBody<typeof Http.AdminUsersResponseSchema>;
export type AdminUser = AdminUsersResponse['users'][number];
export type AdminActivityResponse = WorkerBody<typeof Http.AdminActivityResponseSchema>;
export type AdminActivity = AdminActivityResponse['activity'][number];
export type AdminHealth = WorkerBody<typeof Http.AdminHealthSchema>;
export type AdminAnalytics = WorkerBody<typeof Http.AdminAnalyticsSchema>;
export type FirehoseResponse = WorkerBody<typeof Http.FirehoseResponseSchema>;
export type AdminFirehoseEvent = FirehoseResponse['events'][number];
export type AdminUserDetail = WorkerBody<typeof Http.AdminUserDetailSchema>;
export type AdminCohorts = WorkerBody<typeof Http.AdminCohortsSchema>;
export type AdminRevenue = WorkerBody<typeof Http.AdminRevenueSchema>;
export type AdminAuditLogResponse = WorkerBody<typeof Http.AdminAuditLogResponseSchema>;
export type NotesResponse = WorkerBody<typeof Http.NotesResponseSchema>;
export type CustomerNote = NotesResponse['notes'][number];
export type TagsResponse = WorkerBody<typeof Http.TagsResponseSchema>;
export type CustomerTag = TagsResponse['tags'][number];
export type CustomerHealthResponse = WorkerBody<typeof Http.CustomerHealthResponseSchema>;
export type CustomerHealth = CustomerHealthResponse['health'];
export type AdminAdvancedMetrics = WorkerBody<typeof Http.AdminAdvancedMetricsSchema>;

export async function getAdminDashboard(): Promise<AdminOverview> {
  return apiRequest(Http.AdminOverviewSchema, LicensingRoutes.adminDashboard.path);
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  return apiRequest(Http.AdminAnalyticsSchema, LicensingRoutes.adminAnalytics.path);
}

export async function getAdminFirehose(limit = 50): Promise<FirehoseResponse> {
  return apiRequest(
    Http.FirehoseResponseSchema,
    `${LicensingRoutes.adminFirehose.path}?limit=${limit}`
  );
}

export async function getAdminUsers(
  page = 1,
  limit = 50,
  search = ''
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (search) {
    params.set('search', search);
  }
  return apiRequest(Http.AdminUsersResponseSchema, `${LicensingRoutes.adminUsers.path}?${params}`);
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return apiRequest(
    Http.AdminUserDetailSchema,
    `${LicensingRoutes.adminUserGet.path}?id=${userId}`
  );
}

export async function updateAdminUser(
  userId: string,
  updates: { tier?: string; max_seats?: number; status?: string }
): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.adminUserUpdate.path, {
    method: 'PUT',
    body: JSON.stringify({
      userId,
      tier: updates.tier,
      status: updates.status,
    }),
  });
}

export async function getAdminActivity(): Promise<AdminActivityResponse> {
  return apiRequest(Http.AdminActivityResponseSchema, LicensingRoutes.adminActivity.path);
}

export async function getAdminHealth(): Promise<AdminHealth> {
  return apiRequest(Http.AdminHealthSchema, LicensingRoutes.adminHealth.path);
}

export async function getAdminCohorts(): Promise<AdminCohorts> {
  return apiRequest(Http.AdminCohortsSchema, LicensingRoutes.adminCohorts.path);
}

export async function getAdminRevenue(): Promise<AdminRevenue> {
  return apiRequest(Http.AdminRevenueSchema, LicensingRoutes.adminRevenue.path);
}

export async function getAdminAuditLog(
  page = 1,
  limit = 50,
  action = ''
): Promise<AdminAuditLogResponse> {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (action) {
    params.set('action', action);
  }
  return apiRequest(
    Http.AdminAuditLogResponseSchema,
    `${LicensingRoutes.adminAuditLog.path}?${params}`
  );
}

export async function getAdminNotes(customerId: string): Promise<NotesResponse> {
  return apiRequest(
    Http.NotesResponseSchema,
    `${LicensingRoutes.adminNotesGet.path}?customerId=${customerId}`
  );
}

export async function createAdminNote(
  customerId: string,
  content: string,
  noteType = 'general'
): Promise<WorkerBody<typeof Http.CreatedNoteSchema>> {
  return apiRequest(Http.CreatedNoteSchema, LicensingRoutes.adminNotesCreate.path, {
    method: 'POST',
    body: JSON.stringify({ customerId, content, noteType }),
  });
}

export async function updateAdminNote(
  noteId: string,
  updates: { content?: string | undefined; isPinned?: boolean | undefined }
): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.adminNotesUpdate.path, {
    method: 'PUT',
    body: JSON.stringify({ noteId, ...updates }),
  });
}

export async function deleteAdminNote(noteId: string): Promise<{ success: boolean }> {
  return apiRequest(
    Http.SuccessSchema,
    `${LicensingRoutes.adminNotesDelete.path}?noteId=${noteId}`,
    { method: 'DELETE' }
  );
}

export async function getAdminTags(): Promise<TagsResponse> {
  return apiRequest(Http.TagsResponseSchema, LicensingRoutes.adminTagsGet.path);
}

export async function createAdminTag(
  name: string,
  color?: string,
  description?: string
): Promise<WorkerBody<typeof Http.CreatedTagSchema>> {
  return apiRequest(Http.CreatedTagSchema, LicensingRoutes.adminTagsGet.path, {
    method: 'POST',
    body: JSON.stringify({ name, color, description }),
  });
}

export async function getAdminCustomerTags(customerId: string): Promise<TagsResponse> {
  return apiRequest(
    Http.TagsResponseSchema,
    `${LicensingRoutes.adminCustomerTagsGet.path}?customerId=${customerId}`
  );
}

export async function assignAdminTag(
  customerId: string,
  tagId: string
): Promise<{ success: boolean }> {
  return apiRequest(Http.SuccessSchema, LicensingRoutes.adminCustomerTagsAssign.path, {
    method: 'POST',
    body: JSON.stringify({ customerId, tagId }),
  });
}

export async function removeAdminTag(
  customerId: string,
  tagId: string
): Promise<{ success: boolean }> {
  return apiRequest(
    Http.SuccessSchema,
    `${LicensingRoutes.adminCustomerTagsRemove.path}?customerId=${customerId}&tagId=${tagId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getAdminCustomerHealth(customerId: string): Promise<CustomerHealthResponse> {
  return apiRequest(
    Http.CustomerHealthResponseSchema,
    `${LicensingRoutes.adminCustomerHealth.path}?customerId=${customerId}`
  );
}

// Advanced Metrics API
export async function getAdminAdvancedMetrics(): Promise<AdminAdvancedMetrics> {
  return apiRequest(Http.AdminAdvancedMetricsSchema, LicensingRoutes.adminAdvancedMetrics.path);
}

// Data Export - Fetch CSV data directly
export async function exportAdminUsers(): Promise<string> {
  const response = await window.fetch(
    `${LICENSING_BFF_BASE}${LicensingRoutes.adminExportUsers.path}`
  );

  if (!response.ok) {
    throw new Error('Failed to export users');
  }

  return await response.text();
}

export async function exportAdminUsage(days = 30): Promise<string> {
  const response = await window.fetch(
    `${LICENSING_BFF_BASE}${LicensingRoutes.adminExportUsage.path}?days=${encodeURIComponent(days)}`
  );

  if (!response.ok) {
    throw new Error('Failed to export usage');
  }

  return await response.text();
}

export async function exportAdminAudit(days = 30): Promise<string> {
  const response = await window.fetch(
    `${LICENSING_BFF_BASE}${LicensingRoutes.adminExportAudit.path}?days=${encodeURIComponent(days)}`
  );

  if (!response.ok) {
    throw new Error('Failed to audit log');
  }

  return await response.text();
}

// Helper function to trigger CSV download in browser
export function downloadCSV(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// Docs Analytics API
// ============================================

export type DocsAnalyticsDashboard = WorkerBody<typeof Http.DocsAnalyticsDashboardSchema>;
export type DocsAnalyticsSummary = DocsAnalyticsDashboard['summary'];
export type DocsPageview = DocsAnalyticsDashboard['pageviews_over_time'][number];
export type DocsTopPage = DocsAnalyticsDashboard['top_pages'][number];
export type DocsReferrer = DocsAnalyticsDashboard['top_referrers'][number];
export type DocsUTMCampaign = DocsAnalyticsDashboard['utm_campaigns'][number];
export type DocsGeo = DocsAnalyticsDashboard['geographic'][number];
export type DocsInteraction = DocsAnalyticsDashboard['top_interactions'][number];
export type DocsPerformance = DocsAnalyticsDashboard['performance'][number];

export async function getDocsAnalytics(days = 30): Promise<DocsAnalyticsDashboard> {
  return get(
    Http.DocsAnalyticsDashboardSchema,
    `${LicensingRoutes.docsAnalyticsDashboard.path}?days=${days}`
  );
}

// ============================================
// AI Insights API
// ============================================

export type SmartInsight = WorkerBody<typeof Http.SmartInsightSchema>;

export async function getSmartInsights(
  target: 'user' | 'team' | 'admin' = 'user'
): Promise<SmartInsight | null> {
  try {
    return await apiRequest(
      Http.SmartInsightSchema,
      `${LicensingRoutes.insights.path}?target=${target}`
    );
  } catch {
    return null;
  }
}

// ============================================
// Site Analytics API
// ============================================

export type SiteGeoAnalytics = WorkerBody<typeof Http.SiteGeoAnalyticsSchema>;
export type SiteGeoData = SiteGeoAnalytics['geo_distribution'][number];
export type SiteRealtimeAnalytics = WorkerBody<typeof Http.SiteRealtimeAnalyticsSchema>;
export type SiteAnalyticsOverview = WorkerBody<typeof Http.SiteAnalyticsOverviewSchema>;

export async function getSiteGeoAnalytics(days = 30): Promise<SiteGeoAnalytics> {
  return apiRequest(
    Http.SiteGeoAnalyticsSchema,
    `${LicensingRoutes.siteAnalyticsGeo.path}?days=${days}`
  );
}

export async function getSiteRealtimeAnalytics(): Promise<SiteRealtimeAnalytics> {
  return apiRequest(Http.SiteRealtimeAnalyticsSchema, LicensingRoutes.siteAnalyticsRealtime.path);
}

export async function getSiteAnalyticsOverview(days = 30): Promise<SiteAnalyticsOverview> {
  return apiRequest(
    Http.SiteAnalyticsOverviewSchema,
    `${LicensingRoutes.siteAnalyticsOverview.path}?days=${days}`
  );
}

export async function trackSiteEvent(
  events: Array<{
    event_type: 'pageview' | 'click' | 'form' | 'error' | 'performance';
    event_name: string;
    properties: Readonly<Record<string, string | number | boolean | null>>;
    session_id: string;
    duration_ms?: number;
  }>
): Promise<WorkerBody<typeof Http.TrackedEventsSchema>> {
  const exit = await Effect.runPromiseExit(
    requestDecodedJson(
      browserWorkerFetcher,
      `${PUBLIC_WORKER_BASE}${LicensingRoutes.siteAnalyticsTrack.path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      },
      Http.TrackedEventsSchema,
      'Site analytics response has an invalid shape'
    )
  );
  return unwrapWorkerApi(exit);
}

// ============================================
// Helpers
// ============================================

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

export type AdminStripeMetrics = WorkerBody<typeof Http.AdminStripeMetricsSchema>;
export type AdminStripeSyncResult = WorkerBody<typeof Http.AdminStripeSyncResultSchema>;

export async function getAdminStripeMetrics(): Promise<AdminStripeMetrics> {
  return get(Http.AdminStripeMetricsSchema, LicensingRoutes.adminStripeMetrics.path);
}

export async function syncAdminStripeData(): Promise<AdminStripeSyncResult> {
  return post(Http.AdminStripeSyncResultSchema, LicensingRoutes.adminStripeSync.path);
}

export async function openAdminBillingPortal(
  email: string
): Promise<WorkerBody<typeof Http.PortalUrlSchema>> {
  return post(Http.PortalUrlSchema, LicensingRoutes.billingPortal.path, { email });
}

export function getStripeCustomerUrl(stripeCustomerId: string): string {
  return `https://dashboard.stripe.com/customers/${stripeCustomerId}`;
}
