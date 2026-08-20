import * as Sentry from '@sentry/cloudflare';
import { forbiddenUnlessAdminSession } from './admin-auth';
import { type Env, corsHeaders, jsonResponse, errorResponse } from './api';
import { InstallsBadgeRowSchema, readOptionalExtraRow } from './contracts/d1-extras';
import {
  handleSendCode,
  handleVerifyCode,
  handleVerifySession,
  handleLogout,
} from './handlers/auth';
import {
  handleUpdateProfile,
  handleRegenerateLicense,
  handleRevokeMachine,
  handleGetSessions,
  handleRevokeSession,
  handleGetAuditLog,
  handleGetTeamMembers,
  handleRevokeTeamMember,
  handleGetTeamPolicies,
  handleGetNotifications,
} from './handlers/dashboard';
import {
  handleValidateLicense,
  handleGetLicense,
  handleReportUsage,
  handleInstallPing,
  handleAnalytics,
} from './handlers/license';
import {
  handleAdminDashboard,
  handleAdminCRMUsers,
  handleAdminUserDetail,
  handleAdminUpdateUser,
  handleAdminActivity,
  handleAdminHealth,
  handleAdminCohorts,
  handleAdminRevenue,
  handleAdminExportUsers,
  handleAdminExportUsage,
  handleAdminExportAudit,
  handleAdminAuditLog,
  handleAdminAnalytics,
  handleAdminGetNotes,
  handleAdminCreateNote,
  handleAdminUpdateNote,
  handleAdminDeleteNote,
  handleAdminGetTags,
  handleAdminGetCustomerTags,
  handleAdminCreateTag,
  handleAdminAssignTag,
  handleAdminRemoveTag,
  handleAdminGetCustomerHealth,
  handleAdminAdvancedMetrics,
} from './handlers/admin';
import { handleGetSmartInsights } from './handlers/insights';
import { handleGetFirehose } from './handlers/firehose';
import {
  handleCreateCheckout,
  handleBillingPortal,
  handleStripeWebhook,
  handleAdminStripeSync,
  handleAdminStripeMetrics,
} from './handlers/billing';
import {
  handleDocsAnalytics,
  handleDocsAnalyticsDashboard,
  cleanupDocsAnalytics,
} from './handlers/docs-analytics';
import { handleGitHubProxy } from './handlers/github-proxy';
import { handleBinaryDownload } from './handlers/downloads';
import { handleImageOptimization } from './handlers/images';
import { handleGetDashboard } from './handlers/account-dashboard';
import { handleCreateSiteSession } from './handlers/site-session';
import {
  handleTrackEvent,
  handleGetGeoAnalytics,
  handleGetRealtimeAnalytics,
  handleGetAnalyticsOverview,
} from './handlers/site-analytics';
import { handleCliEvent, handleCliBatch } from './handlers/telemetry';
import {
  handleDeleteMyData,
  handleExportMyData,
  handleOptOut,
  handlePrivacyStatus,
} from './handlers/privacy';
import { normalizeLicensingPath, resolveLicensingRoute } from '../../shared/licensing-routes';

async function handleInstallsBadge(env: Env): Promise<Response> {
  try {
    const result = await env.DB.prepare(
      `SELECT COUNT(DISTINCT install_id) as total FROM install_stats`
    ).first();
    const badgeLookup = await readOptionalExtraRow(
      InstallsBadgeRowSchema,
      'Installs badge row has an invalid shape',
      result
    );
    if (badgeLookup._tag === 'invalid') {
      Sentry.captureMessage('Installs badge row has an invalid shape');
    }
    const total = badgeLookup._tag === 'present' ? badgeLookup.value.total : 0;
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        label: 'installs',
        message: total.toLocaleString(),
        color: 'blue',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, must-revalidate',
          ...corsHeaders,
        },
      }
    );
  } catch (error: unknown) {
    Sentry.captureException(error);
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        label: 'installs',
        message: '0',
        color: 'blue',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, must-revalidate',
          ...corsHeaders,
        },
      }
    );
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: 'production',
  }),
  {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            ...corsHeaders,
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      const url = new URL(request.url);
      const path = normalizeLicensingPath(url.pathname);

      try {
        if (path.startsWith('/download/') && request.method === 'GET') {
          return handleBinaryDownload(request, env);
        }
        if (path.startsWith('/img/') && request.method === 'GET') {
          return handleImageOptimization(request, env);
        }

        const route = resolveLicensingRoute(request.method, path);
        if (route === undefined) {
          return errorResponse('Not found', 404);
        }

        switch (route.path) {
          case '/health':
            return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
          case '/api/auth/send-code':
            return handleSendCode(request, env);
          case '/api/auth/verify-code':
            return handleVerifyCode(request, env);
          case '/api/auth/verify-session':
            return handleVerifySession(request, env);
          case '/api/auth/logout':
            return handleLogout(request, env);
          case '/api/validate-license':
            return handleValidateLicense(request, env);
          case '/api/get-license':
            return handleGetLicense(request, env);
          case '/api/report-usage':
            return handleReportUsage(request, env);
          case '/api/install-ping':
            return handleInstallPing(request, env);
          case '/api/analytics':
            return handleAnalytics(request, env);
          case '/api/cli/event':
            return handleCliEvent(request, env);
          case '/api/cli/batch':
            return handleCliBatch(request, env);
          case '/api/privacy/status':
            return handlePrivacyStatus(request, env);
          case '/api/privacy/export':
            return handleExportMyData(request, env);
          case '/api/privacy/delete':
            return handleDeleteMyData(request, env);
          case '/api/privacy/opt-out':
            return handleOptOut(request, env);
          case '/api/docs/analytics':
            return handleDocsAnalytics(request, env, ctx);
          case '/api/docs/analytics/dashboard': {
            const denied = await forbiddenUnlessAdminSession(request, env);
            return denied ?? handleDocsAnalyticsDashboard(request, env);
          }
          case '/api/site/analytics/track':
            return handleTrackEvent(request, env);
          case '/api/site/analytics/geo': {
            const denied = await forbiddenUnlessAdminSession(request, env);
            return denied ?? handleGetGeoAnalytics(request, env);
          }
          case '/api/site/analytics/realtime': {
            const denied = await forbiddenUnlessAdminSession(request, env);
            return denied ?? handleGetRealtimeAnalytics(request, env);
          }
          case '/api/site/analytics/overview': {
            const denied = await forbiddenUnlessAdminSession(request, env);
            return denied ?? handleGetAnalyticsOverview(request, env);
          }
          case '/api/github-stats':
            return handleGitHubProxy(request, env, ctx);
          case '/api/internal/site-session':
            return handleCreateSiteSession(request, env);
          case '/api/dashboard':
            return handleGetDashboard(request, env);
          case '/api/user/profile':
            return handleUpdateProfile(request, env);
          case '/api/license/regenerate':
            return handleRegenerateLicense(request, env);
          case '/api/machines/revoke':
            return handleRevokeMachine(request, env);
          case '/api/sessions':
            return handleGetSessions(request, env);
          case '/api/sessions/revoke':
            return handleRevokeSession(request, env);
          case '/api/audit-log':
            return handleGetAuditLog(request, env);
          case '/api/team/members':
            return handleGetTeamMembers(request, env);
          case '/api/team/policies':
            return handleGetTeamPolicies(request, env);
          case '/api/team/notifications':
            return handleGetNotifications(request, env);
          case '/api/team/audit-logs':
            return handleGetAuditLog(request, env);
          case '/api/team/revoke':
            return handleRevokeTeamMember(request, env);
          case '/api/admin/dashboard':
            return handleAdminDashboard(request, env);
          case '/api/admin/users':
            return handleAdminCRMUsers(request, env);
          case '/api/admin/user':
            return route.method === 'GET'
              ? handleAdminUserDetail(request, env)
              : handleAdminUpdateUser(request, env);
          case '/api/admin/activity':
            return handleAdminActivity(request, env);
          case '/api/admin/health':
            return handleAdminHealth(request, env);
          case '/api/admin/cohorts':
            return handleAdminCohorts(request, env);
          case '/api/admin/revenue':
            return handleAdminRevenue(request, env);
          case '/api/admin/analytics':
            return handleAdminAnalytics(request, env);
          case '/api/admin/export/users':
            return handleAdminExportUsers(request, env);
          case '/api/admin/export/usage':
            return handleAdminExportUsage(request, env);
          case '/api/admin/export/audit':
            return handleAdminExportAudit(request, env);
          case '/api/admin/audit-log':
            return handleAdminAuditLog(request, env);
          case '/api/admin/notes':
            switch (route.method) {
              case 'GET':
                return handleAdminGetNotes(request, env);
              case 'POST':
                return handleAdminCreateNote(request, env);
              case 'PUT':
                return handleAdminUpdateNote(request, env);
              case 'DELETE':
                return handleAdminDeleteNote(request, env);
              default:
                return errorResponse('Not found', 404);
            }
          case '/api/admin/tags':
            return route.method === 'GET'
              ? handleAdminGetTags(request, env)
              : handleAdminCreateTag(request, env);
          case '/api/admin/customer-tags':
            switch (route.method) {
              case 'GET':
                return handleAdminGetCustomerTags(request, env);
              case 'POST':
                return handleAdminAssignTag(request, env);
              case 'DELETE':
                return handleAdminRemoveTag(request, env);
              default:
                return errorResponse('Not found', 404);
            }
          case '/api/admin/customer-health':
            return handleAdminGetCustomerHealth(request, env);
          case '/api/admin/advanced-metrics':
            return handleAdminAdvancedMetrics(request, env);
          case '/api/admin/firehose':
            return handleGetFirehose(request, env);
          case '/api/insights':
            return handleGetSmartInsights(request, env);
          case '/api/stripe/webhook':
            return handleStripeWebhook(request, env);
          case '/api/billing/portal':
            return handleBillingPortal(request, env);
          case '/api/billing/checkout':
            return handleCreateCheckout(request, env);
          case '/api/admin/stripe/sync':
            return handleAdminStripeSync(request, env);
          case '/api/admin/stripe/metrics':
            return handleAdminStripeMetrics(request, env);
          case '/api/badge/installs':
            return handleInstallsBadge(env);
        }
        return errorResponse('Not found', 404);
      } catch (error: unknown) {
        Sentry.captureException(error);
        return errorResponse('Internal server error', 500);
      }
    },

    async scheduled(
      _controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext
    ): Promise<void> {
      ctx.waitUntil(
        cleanupDocsAnalytics(env.DB).catch(error => {
          Sentry.captureException(error);
        })
      );
    },
  }
);
