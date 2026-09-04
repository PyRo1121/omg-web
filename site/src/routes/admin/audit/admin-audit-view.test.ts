import { describe, expect, it } from 'vitest';
import { adminAuditNavigation } from './admin-audit-view';

describe('admin audit navigation', () => {
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
