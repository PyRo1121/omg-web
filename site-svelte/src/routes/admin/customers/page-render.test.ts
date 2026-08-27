import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';
import { parseAdminCustomerDirectoryQuery } from '../../../lib/server/admin-customers.server';

const data = {
  directory: {
    customers: [
      {
        activeDays30d: 0,
        activeMachines: 0,
        company: 'Example Company',
        createdAt: '2026-08-21 19:09:19',
        email: 'customer@example.com',
        engagementScore: 0,
        lastActiveDate: null,
        lifecycleStage: 'new',
        status: 'active',
        tier: 'enterprise',
        totalCommands: 0,
      },
    ],
    pagination: { page: 1, pageSize: 25, total: 1, pages: 1 },
  },
  operatorName: 'Operator',
  search: '',
};

describe('customer directory query boundary', () => {
  it('rejects malformed, excessive, and silently truncating parameters', () => {
    expect(
      parseAdminCustomerDirectoryQuery(new URL('https://example.test/admin/customers/?page=1e3'))
    ).toBeNull();
    expect(
      parseAdminCustomerDirectoryQuery(new URL('https://example.test/admin/customers/?page=10001'))
    ).toBeNull();
    expect(
      parseAdminCustomerDirectoryQuery(
        new URL(`https://example.test/admin/customers/?q=${'x'.repeat(101)}`)
      )
    ).toBeNull();
  });

  it('normalizes valid search whitespace after validating its boundary', () => {
    expect(
      parseAdminCustomerDirectoryQuery(
        new URL('https://example.test/admin/customers/?page=2&q=%20team%20')
      )
    ).toEqual({ page: 2, search: 'team' });
  });
});

describe('customer directory SSR', () => {
  it('renders a live-shaped directory page without an action response', () => {
    const result = render(Page, { props: { data, form: null } });

    expect(result.body).toContain('Customer intelligence');
    expect(result.body).toContain('customer@example.com');
    expect(result.body).toContain('Inspect');
  });
});
