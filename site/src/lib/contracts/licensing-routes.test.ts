import { describe, expect, it } from 'vitest';
import {
  CLI_SERVICE_API_CONTRACT,
  LICENSING_HTTP_API_VERSION,
  LicensingRoutes,
  isSiteBffRoute,
  normalizeLicensingPath,
  resolveLicensingRoute,
} from '../../../../shared/licensing-routes';

describe('licensing HTTP route registry', () => {
  it('has a version and no duplicate method/path pairs', () => {
    const routes = Object.values(LicensingRoutes);
    const routeKeys = routes.map(route => `${route.method} ${route.path}`);

    expect(LICENSING_HTTP_API_VERSION).toBe(1);
    expect(new Set(routeKeys).size).toBe(routeKeys.length);
  });

  it('publishes the exact versioned CLI route subset', () => {
    expect(CLI_SERVICE_API_CONTRACT).toEqual({
      schemaVersion: 1,
      origin: 'https://omg-api.latham.cloud',
      cliEndpoints: {
        validateLicense: {
          method: 'POST',
          path: '/api/validate-license',
          authentication: 'none',
        },
        reportUsage: {
          method: 'POST',
          path: '/api/report-usage',
          authentication: 'none',
        },
        installPing: {
          method: 'POST',
          path: '/api/install-ping',
          authentication: 'none',
        },
        cliBatch: {
          method: 'POST',
          path: '/api/cli/batch',
          authentication: 'none',
        },
        teamMembers: {
          method: 'GET',
          path: '/api/license/members',
          authentication: 'license-key',
        },
        teamPolicies: {
          method: 'GET',
          path: '/api/license/policies',
          authentication: 'license-key',
        },
        teamAuditLog: {
          method: 'GET',
          path: '/api/license/audit',
          authentication: 'license-key',
        },
      },
    });
  });

  it('resolves canonical routes and normalizes a trailing slash', () => {
    expect(resolveLicensingRoute('GET', '/api/dashboard')).toBe(LicensingRoutes.dashboard);
    expect(resolveLicensingRoute('GET', '/api/dashboard/')).toBe(LicensingRoutes.dashboard);
    expect(normalizeLicensingPath('/')).toBe('/');
  });

  it('derives the BFF allowlist from transport policy', () => {
    expect(isSiteBffRoute('GET', '/api/admin/users')).toBe(true);
    expect(isSiteBffRoute('POST', '/api/billing/checkout')).toBe(true);
    expect(isSiteBffRoute('POST', '/api/stripe/webhook')).toBe(false);
    expect(isSiteBffRoute('POST', '/api/internal/site-session')).toBe(false);
  });

  it('does not resolve removed compatibility aliases or unsupported methods', () => {
    expect(resolveLicensingRoute('GET', '/api/fleet/status')).toBeUndefined();
    expect(resolveLicensingRoute('GET', '/api/team/analytics')).toBeUndefined();
    expect(resolveLicensingRoute('GET', '/api/team/members')).toBeUndefined();
    expect(resolveLicensingRoute('GET', '/api/team/policies')).toBeUndefined();
    expect(resolveLicensingRoute('GET', '/api/team/notifications')).toBeUndefined();
    expect(resolveLicensingRoute('GET', '/api/team/audit-logs')).toBeUndefined();
    expect(resolveLicensingRoute('POST', '/api/team/revoke')).toBeUndefined();
    expect(resolveLicensingRoute('GET', '/api/admin/events')).toBeUndefined();
    expect(resolveLicensingRoute('DELETE', '/api/dashboard')).toBeUndefined();
  });
});
