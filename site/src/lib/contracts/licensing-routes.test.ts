import { describe, expect, it } from 'vitest';
import {
  LICENSING_HTTP_API_VERSION,
  LicensingRoutes,
  isSiteBffRoute,
  normalizeLicensingPath,
  resolveLicensingRoute,
} from '../../../shared/licensing-routes';

describe('licensing HTTP route registry', () => {
  it('has a version and no duplicate method/path pairs', () => {
    const routes = Object.values(LicensingRoutes);
    const routeKeys = routes.map(route => `${route.method} ${route.path}`);

    expect(LICENSING_HTTP_API_VERSION).toBe(1);
    expect(new Set(routeKeys).size).toBe(routeKeys.length);
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
    expect(resolveLicensingRoute('GET', '/api/admin/events')).toBeUndefined();
    expect(resolveLicensingRoute('DELETE', '/api/dashboard')).toBeUndefined();
  });
});
