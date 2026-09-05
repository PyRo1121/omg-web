import { describe, expect, it } from 'vitest';
import { adminAuditActionHref, adminAuditNavigation } from './admin-audit-view';

describe('admin audit navigation', () => {
  it('opens an action drill-down at the first audit page', () => {
    expect(adminAuditActionHref('billing.checkout_created')).toBe(
      '/admin/audit/?page=1&action=billing.checkout_created'
    );
  });

  it('does not turn action text into additional query parameters', () => {
    const url = new URL(adminAuditActionHref('auth.login&page=99'), 'https://getomg.xyz');
    expect(url.pathname).toBe('/admin/audit/');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('action')).toBe('auth.login&page=99');
  });

  it('bounds pages and preserves only the validated action filter', () => {
    expect(adminAuditNavigation(2, 4, 'auth.login')).toEqual({
      currentPage: 2,
      totalPages: 4,
      hasPrevious: true,
      hasNext: true,
      previousHref: '?page=1&action=auth.login',
      nextHref: '?page=3&action=auth.login',
    });
    expect(adminAuditNavigation(1, 0, '')).toMatchObject({
      currentPage: 1,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
    });
  });
});
