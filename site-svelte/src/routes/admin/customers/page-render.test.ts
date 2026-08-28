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

  it('renders localized support intelligence without private identifiers', () => {
    const result = render(Page, {
      props: {
        data,
        form: {
          kind: 'detail',
          detail: {
            company: 'Example Company',
            createdAt: '2026-08-21T19:09:19.000Z',
            email: 'customer@example.com',
            expiresAt: null,
            machines: [],
            maxMachines: 8,
            maxSeats: 5,
            status: 'active',
            telemetryOptOut: false,
            tier: 'team',
            updatedAt: '2026-08-28T12:00:00.000Z',
            usage: [],
          },
          support: {
            health: {
              kind: 'available',
              value: {
                activationScore: 91,
                engagementScore: 88,
                growthScore: 74,
                lifecycleStage: 'power_user',
                overallScore: 82,
                riskScore: 18,
                updatedAt: '2026-08-28T12:00:00.000Z',
              },
            },
            notes: {
              kind: 'available',
              values: [
                {
                  authorEmail: 'operator@example.com',
                  content: 'Expansion review scheduled.',
                  createdAt: '2026-08-27T12:00:00.000Z',
                  noteType: 'success',
                  pinned: true,
                  updatedAt: '2026-08-28T12:00:00.000Z',
                },
              ],
            },
            assignedTags: {
              kind: 'available',
              values: [
                {
                  color: '#22c55e',
                  description: 'Ready for account growth',
                  name: 'Expansion',
                },
              ],
            },
            tagCatalog: { kind: 'available', values: [] },
          },
        },
      },
    });

    expect(result.body).toContain('Customer health');
    expect(result.body).toContain('Expansion review scheduled.');
    expect(result.body).toContain('Ready for account growth');
    expect(result.body).not.toContain('private-customer-id');
    expect(result.body).not.toContain('private-note-id');
    expect(result.body).not.toContain('private-tag-id');
  });
});
