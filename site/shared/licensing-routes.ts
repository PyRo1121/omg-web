/** Production origin of the licensing and analytics Worker. */
export const LICENSING_API_ORIGIN = 'https://omg-api.latham.cloud';

/** Version of the licensing HTTP route contract shared by the site BFF and Worker. */
export const LICENSING_HTTP_API_VERSION = 1;

interface LicensingRouteDefinition {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: `/${string}`;
  readonly authentication:
    'none' | 'license-key' | 'session' | 'admin-session' | 'admin-secret' | 'stripe-signature';
  readonly transport: 'direct' | 'site-bff' | 'internal';
}

export const LicensingRoutes = {
  health: {
    method: 'GET',
    path: '/health',
    authentication: 'none',
    transport: 'direct',
  },
  authSendCode: {
    method: 'POST',
    path: '/api/auth/send-code',
    authentication: 'none',
    transport: 'direct',
  },
  authVerifyCode: {
    method: 'POST',
    path: '/api/auth/verify-code',
    authentication: 'none',
    transport: 'direct',
  },
  authVerifySession: {
    method: 'POST',
    path: '/api/auth/verify-session',
    authentication: 'none',
    transport: 'direct',
  },
  authLogout: {
    method: 'POST',
    path: '/api/auth/logout',
    authentication: 'none',
    transport: 'direct',
  },
  validateLicensePost: {
    method: 'POST',
    path: '/api/validate-license',
    authentication: 'none',
    transport: 'direct',
  },
  getLicense: {
    method: 'GET',
    path: '/api/get-license',
    authentication: 'session',
    transport: 'direct',
  },
  reportUsage: {
    method: 'POST',
    path: '/api/report-usage',
    authentication: 'none',
    transport: 'direct',
  },
  installPing: {
    method: 'POST',
    path: '/api/install-ping',
    authentication: 'none',
    transport: 'direct',
  },
  analytics: {
    method: 'POST',
    path: '/api/analytics',
    authentication: 'none',
    transport: 'direct',
  },
  cliEvent: {
    method: 'POST',
    path: '/api/cli/event',
    authentication: 'none',
    transport: 'direct',
  },
  cliBatch: {
    method: 'POST',
    path: '/api/cli/batch',
    authentication: 'none',
    transport: 'direct',
  },
  cliTeamMembers: {
    method: 'GET',
    path: '/api/license/members',
    authentication: 'license-key',
    transport: 'direct',
  },
  cliPolicies: {
    method: 'GET',
    path: '/api/license/policies',
    authentication: 'license-key',
    transport: 'direct',
  },
  cliAuditLog: {
    method: 'GET',
    path: '/api/license/audit',
    authentication: 'license-key',
    transport: 'direct',
  },
  privacyStatus: {
    method: 'GET',
    path: '/api/privacy/status',
    authentication: 'session',
    transport: 'direct',
  },
  privacyExport: {
    method: 'POST',
    path: '/api/privacy/export',
    authentication: 'session',
    transport: 'direct',
  },
  privacyDelete: {
    method: 'POST',
    path: '/api/privacy/delete',
    authentication: 'session',
    transport: 'direct',
  },
  privacyOptOut: {
    method: 'POST',
    path: '/api/privacy/opt-out',
    authentication: 'session',
    transport: 'direct',
  },
  docsAnalytics: {
    method: 'POST',
    path: '/api/docs/analytics',
    authentication: 'none',
    transport: 'direct',
  },
  docsAnalyticsDashboard: {
    method: 'GET',
    path: '/api/docs/analytics/dashboard',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  siteAnalyticsTrack: {
    method: 'POST',
    path: '/api/site/analytics/track',
    authentication: 'none',
    transport: 'direct',
  },
  siteAnalyticsGeo: {
    method: 'GET',
    path: '/api/site/analytics/geo',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  siteAnalyticsRealtime: {
    method: 'GET',
    path: '/api/site/analytics/realtime',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  siteAnalyticsOverview: {
    method: 'GET',
    path: '/api/site/analytics/overview',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  githubStats: {
    method: 'GET',
    path: '/api/github-stats',
    authentication: 'none',
    transport: 'direct',
  },
  internalSiteSession: {
    method: 'POST',
    path: '/api/internal/site-session',
    authentication: 'admin-secret',
    transport: 'internal',
  },
  marketingOffer: {
    method: 'POST',
    path: '/api/internal/marketing-offer',
    authentication: 'admin-secret',
    transport: 'internal',
  },
  organizationInvitationEmail: {
    method: 'POST',
    path: '/api/internal/organization-invitation-email',
    authentication: 'admin-secret',
    transport: 'internal',
  },
  organizationUsage: {
    method: 'POST',
    path: '/api/internal/organization-usage',
    authentication: 'admin-secret',
    transport: 'internal',
  },
  organizationAudit: {
    method: 'POST',
    path: '/api/internal/organization-audit',
    authentication: 'admin-secret',
    transport: 'internal',
  },
  dashboard: {
    method: 'GET',
    path: '/api/dashboard',
    authentication: 'session',
    transport: 'site-bff',
  },
  updateProfile: {
    method: 'PUT',
    path: '/api/user/profile',
    authentication: 'session',
    transport: 'site-bff',
  },
  regenerateLicense: {
    method: 'POST',
    path: '/api/license/regenerate',
    authentication: 'session',
    transport: 'site-bff',
  },
  revokeMachine: {
    method: 'POST',
    path: '/api/machines/revoke',
    authentication: 'session',
    transport: 'site-bff',
  },
  sessions: {
    method: 'GET',
    path: '/api/sessions',
    authentication: 'session',
    transport: 'site-bff',
  },
  revokeSession: {
    method: 'POST',
    path: '/api/sessions/revoke',
    authentication: 'session',
    transport: 'site-bff',
  },
  auditLog: {
    method: 'GET',
    path: '/api/audit-log',
    authentication: 'session',
    transport: 'site-bff',
  },
  adminDashboard: {
    method: 'GET',
    path: '/api/admin/dashboard',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminOrganizations: {
    method: 'GET',
    path: '/api/admin/organizations',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminOrganizationSupport: {
    method: 'GET',
    path: '/api/admin/organizations/support',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminUsers: {
    method: 'GET',
    path: '/api/admin/users',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminUserGet: {
    method: 'GET',
    path: '/api/admin/user',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminUserUpdate: {
    method: 'PUT',
    path: '/api/admin/user',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminActivity: {
    method: 'GET',
    path: '/api/admin/activity',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminHealth: {
    method: 'GET',
    path: '/api/admin/health',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminCohorts: {
    method: 'GET',
    path: '/api/admin/cohorts',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminRevenue: {
    method: 'GET',
    path: '/api/admin/revenue',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminAnalytics: {
    method: 'GET',
    path: '/api/admin/analytics',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminExportUsers: {
    method: 'GET',
    path: '/api/admin/export/users',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminExportUsage: {
    method: 'GET',
    path: '/api/admin/export/usage',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminExportAudit: {
    method: 'GET',
    path: '/api/admin/export/audit',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminAuditLog: {
    method: 'GET',
    path: '/api/admin/audit-log',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminNotesGet: {
    method: 'GET',
    path: '/api/admin/notes',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminNotesCreate: {
    method: 'POST',
    path: '/api/admin/notes',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminNotesUpdate: {
    method: 'PUT',
    path: '/api/admin/notes',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminNotesDelete: {
    method: 'DELETE',
    path: '/api/admin/notes',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminTagsGet: {
    method: 'GET',
    path: '/api/admin/tags',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminTagsCreate: {
    method: 'POST',
    path: '/api/admin/tags',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminCustomerTagsGet: {
    method: 'GET',
    path: '/api/admin/customer-tags',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminCustomerTagsAssign: {
    method: 'POST',
    path: '/api/admin/customer-tags',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminCustomerTagsRemove: {
    method: 'DELETE',
    path: '/api/admin/customer-tags',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminCustomerHealth: {
    method: 'GET',
    path: '/api/admin/customer-health',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminAdvancedMetrics: {
    method: 'GET',
    path: '/api/admin/advanced-metrics',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminFirehose: {
    method: 'GET',
    path: '/api/admin/firehose',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  stripeWebhook: {
    method: 'POST',
    path: '/api/stripe/webhook',
    authentication: 'stripe-signature',
    transport: 'direct',
  },
  billingPortal: {
    method: 'POST',
    path: '/api/billing/portal',
    authentication: 'session',
    transport: 'site-bff',
  },
  billingCheckout: {
    method: 'POST',
    path: '/api/billing/checkout',
    authentication: 'session',
    transport: 'site-bff',
  },
  billingCheckoutSession: {
    // Post-checkout fulfillment stays bound to the Better Auth account that
    // created checkout; the site BFF supplies its short-lived Worker session.
    method: 'GET',
    path: '/api/billing/checkout-session',
    authentication: 'session',
    transport: 'site-bff',
  },
  adminStripeSync: {
    method: 'POST',
    path: '/api/admin/stripe/sync',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  adminStripeMetrics: {
    method: 'GET',
    path: '/api/admin/stripe/metrics',
    authentication: 'admin-session',
    transport: 'site-bff',
  },
  installsBadge: {
    method: 'GET',
    path: '/api/badge/installs',
    authentication: 'none',
    transport: 'direct',
  },
} as const satisfies Readonly<Record<string, LicensingRouteDefinition>>;

type CliServiceRouteDefinition = Pick<
  LicensingRouteDefinition,
  'authentication' | 'method' | 'path'
>;

function cliServiceRoute(route: LicensingRouteDefinition): CliServiceRouteDefinition {
  return {
    method: route.method,
    path: route.path,
    authentication: route.authentication,
  };
}

/** Machine-readable CLI subset shared with the versioned Rust service contract. */
export const CLI_SERVICE_API_CONTRACT = {
  schemaVersion: LICENSING_HTTP_API_VERSION,
  origin: LICENSING_API_ORIGIN,
  cliEndpoints: {
    validateLicense: cliServiceRoute(LicensingRoutes.validateLicensePost),
    reportUsage: cliServiceRoute(LicensingRoutes.reportUsage),
    installPing: cliServiceRoute(LicensingRoutes.installPing),
    cliBatch: cliServiceRoute(LicensingRoutes.cliBatch),
    teamMembers: cliServiceRoute(LicensingRoutes.cliTeamMembers),
    teamPolicies: cliServiceRoute(LicensingRoutes.cliPolicies),
    teamAuditLog: cliServiceRoute(LicensingRoutes.cliAuditLog),
  },
} as const;

const routeEntries = Object.values(LicensingRoutes);

/** Remove a non-root trailing slash before route resolution. */
export function normalizeLicensingPath(path: string): string {
  return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
}

/** Resolve one exact method/path pair from the versioned licensing contract. */
export function resolveLicensingRoute(
  method: string,
  path: string
): (typeof LicensingRoutes)[keyof typeof LicensingRoutes] | undefined {
  const normalizedPath = normalizeLicensingPath(path);
  return routeEntries.find(route => route.method === method && route.path === normalizedPath);
}

/** Whether a route is permitted through the authenticated same-origin site BFF. */
export function isSiteBffRoute(method: string, path: string): boolean {
  return resolveLicensingRoute(method, path)?.transport === 'site-bff';
}
