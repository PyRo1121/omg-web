import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { OrganizationSummary } from '../../../lib/server/organization-workspace.server';
import OrganizationPage from './+page.svelte';

describe('organization workspace page', () => {
  it('renders the paid bootstrap form without private entitlement references', () => {
    const result = render(OrganizationPage, {
      props: {
        data: { organization: { status: 'eligible', tier: 'team', maxSeats: 12 } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('Name your workspace.');
    expect(result.body).toContain('12 seats');
    expect(result.body).toContain('method="POST"');
    expect(result.body).toContain('action="?/createOrganization"');
    expect(result.body).toContain('name="name"');
    expect(result.body).toContain('name="slug"');
    expect(result.body).not.toContain('customer_');
    expect(result.body).not.toContain('license_');
  });

  it('renders a useful individual-plan boundary without fake employee controls', () => {
    const result = render(OrganizationPage, {
      props: {
        data: { organization: { status: 'individual', tier: 'pro' } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('Your analytics, achievements, machine fleet, and settings');
    expect(result.body).toContain('Compare Team plans');
    expect(result.body).not.toContain('Create organization');
    expect(result.body).not.toContain('Invite');
  });

  it('renders active and restricted organization facts without raw identifiers', () => {
    const organization: OrganizationSummary = {
      maxSeats: 20,
      name: 'Acme Engineering',
      role: 'owner',
      slug: 'acme-engineering',
      tier: 'enterprise',
      usedSeats: 7,
    };
    const active = render(OrganizationPage, {
      props: { data: { organization: { status: 'active', organization } }, form: null, params: {} },
    });
    const restricted = render(OrganizationPage, {
      props: {
        data: { organization: { status: 'restricted', organization } },
        form: null,
        params: {},
      },
    });

    expect(active.body).toContain('Acme Engineering');
    expect(active.body).toContain('7 / 20');
    expect(active.body).toContain('acme-engineering');
    expect(active.body).toContain('/dashboard/organization/members/');
    expect(active.body).toContain('/dashboard/organization/usage/');
    expect(restricted.body).toContain('Membership growth is paused.');
    expect(restricted.body).toContain('/dashboard/organization/members/');
    expect(restricted.body).toContain('/dashboard/organization/usage/');
    for (const body of [active.body, restricted.body]) {
      expect(body).not.toContain('private-customer-id');
      expect(body).not.toContain('private-user-id');
      expect(body).not.toContain('private-session-token');
    }
  });
});
