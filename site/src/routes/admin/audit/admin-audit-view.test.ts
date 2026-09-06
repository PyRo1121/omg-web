import { describe, expect, it } from 'vitest';
import { parseAdminAuditQuery } from '../../../lib/server/admin-operations.server';
import { adminAuditActionHref, adminAuditNavigation } from './admin-audit-view';

describe('admin audit navigation', () => {
  it('opens an action drill-down at the first audit page', () => {
    expect(adminAuditActionHref('billing.checkout_created')).toBe(
      '/admin/audit/?page=1&action=billing.checkout_created'
    );
  });

  it.each(['data_export_request', 'data_deletion_request', 'auth.login&page=99', ''])(
    'does not offer a rejected filter for %s',
    action => {
      expect(adminAuditActionHref(action)).toBeNull();
    }
  );

  it.each(['billing.checkout_created', 'site.session_created', 'admin.export_users'])(
    'generates a destination accepted by the server for %s',
    action => {
      const href = adminAuditActionHref(action);
      if (href === null) throw new Error('Expected a supported action link');
      expect(parseAdminAuditQuery(new URL(href, 'https://getomg.xyz'))).toEqual({
        action,
        page: 1,
      });
    }
  );

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
