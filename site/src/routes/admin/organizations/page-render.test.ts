import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import OrganizationsPage from './+page.svelte';

describe('operator organization directory', () => {
  it('renders browser-safe entitlement and workspace summaries', () => {
    const result = render(OrganizationsPage, {
      props: {
        data: {
          operatorName: 'Operator',
          search: '',
          directory: {
            organizations: [
              {
                name: 'Acme Engineering',
                slug: 'acme-engineering',
                tier: 'team',
                status: 'active',
                seatsUsed: 2,
                seatLimit: 5,
                pendingInvitations: 1,
                activeMachines: 3,
                lastAuditAt: '2026-08-29T12:00:00.000Z',
              },
            ],
            pagination: { page: 1, pageSize: 25, total: 1, pages: 1 },
          },
        },
        form: null,
        params: {},
      },
    });
    expect(result.body).toContain('Acme Engineering');
    expect(result.body).toContain('acme-engineering');
    expect(result.body).toContain('team · active');
    expect(result.body).toContain('Aug 29, 2026, 12:00 PM UTC');
    expect(result.body).toContain('/admin/organizations/support/?slug=acme-engineering');
    expect(result.body).not.toContain('customer-private-id');
    expect(result.body).not.toContain('license-key');
    expect(result.body).not.toContain('member-private-id');
  });
});
