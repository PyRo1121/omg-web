import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { OrganizationAuditResponse } from '../../../../../../site/shared/organization-audit';
import OrganizationAuditPage from './+page.svelte';

const AUDIT: OrganizationAuditResponse = {
  organization: { name: 'Acme Engineering', role: 'owner', status: 'active', tier: 'team' },
  filter: 'members',
  page: 2,
  pageSize: 25,
  hasMore: true,
  events: [
    {
      action: 'organization.member.role_changed',
      role: 'admin',
      occurredAt: '2026-08-29T12:00:00.000Z',
    },
    {
      action: 'organization.member.ownership_transferred',
      role: null,
      occurredAt: '2026-08-29T11:00:00.000Z',
    },
  ],
};

describe('organization audit page', () => {
  it('renders bounded history and pagination without private identifiers', () => {
    const result = render(OrganizationAuditPage, {
      props: {
        data: { organizationAudit: { status: 'available', audit: AUDIT } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('Acme Engineering');
    expect(result.body).toContain('Organization history');
    expect(result.body).toContain('Member role changed');
    expect(result.body).toContain('Ownership transferred');
    expect(result.body).toContain('Aug 29, 2026, 12:00 PM UTC');
    expect(result.body).toContain('?filter=members');
    expect(result.body).toContain('?filter=members&amp;page=3');
    expect(result.body).not.toContain('private-organization-id');
    expect(result.body).not.toContain('private-user-id');
    expect(result.body).not.toContain('private-member-event');
    expect(result.body).not.toContain('customer-id');
  });

  it('preserves restricted reads and explicit empty and unavailable states', () => {
    const restricted = render(OrganizationAuditPage, {
      props: {
        data: {
          organizationAudit: {
            status: 'available',
            audit: {
              ...AUDIT,
              organization: { ...AUDIT.organization, status: 'restricted' },
              events: [],
              hasMore: false,
            },
          },
        },
        form: null,
        params: {},
      },
    });
    const unavailable = render(OrganizationAuditPage, {
      props: {
        data: { organizationAudit: { status: 'unavailable' } },
        form: null,
        params: {},
      },
    });

    expect(restricted.body).toContain('Organization history remains readable');
    expect(restricted.body).toContain('No recorded changes on this page');
    expect(unavailable.body).toContain('Organization history is temporarily unavailable');
  });
});
