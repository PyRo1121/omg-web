import { describe, expect, it } from 'vitest';
import { parseAdminOrganizationQuery } from './admin-organizations.server';

describe('admin organization query boundary', () => {
  it('accepts bounded search and pagination', () => {
    expect(
      parseAdminOrganizationQuery(new URL('https://example.test/admin/organizations/'))
    ).toEqual({ page: 1, search: '' });
    expect(
      parseAdminOrganizationQuery(
        new URL('https://example.test/admin/organizations/?page=40&q=acme')
      )
    ).toEqual({ page: 40, search: 'acme' });
  });

  it.each(['?page=0', '?page=41', '?page=1.5', '?page=1&page=2', `?q=${'x'.repeat(101)}`])(
    'rejects %s',
    query => {
      expect(
        parseAdminOrganizationQuery(new URL(`https://example.test/admin/organizations/${query}`))
      ).toBeNull();
    }
  );
});
