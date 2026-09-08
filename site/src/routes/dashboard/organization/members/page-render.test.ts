import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { OrganizationSummary } from '../../../../lib/server/organization-workspace.server';
import MembersPage from './+page.svelte';

const organization: OrganizationSummary = {
  maxSeats: 12,
  name: 'Acme Engineering',
  role: 'owner',
  slug: 'acme-engineering',
  tier: 'team',
  usedSeats: 2,
};

describe('organization members page', () => {
  it('renders members and pending invitations without private identifiers', () => {
    const result = render(MembersPage, {
      props: {
        data: {
          organization: {
            status: 'active',
            organization,
            members: [
              {
                email: 'owner@example.com',
                joinedAt: '2026-08-28T00:00:00.000Z',
                name: 'Owner',
                role: 'owner',
              },
              {
                email: 'admin@example.com',
                joinedAt: '2026-08-28T00:00:00.000Z',
                name: 'Admin',
                role: 'admin',
              },
            ],
            invitations: [
              {
                email: 'invitee@example.com',
                expiresAt: '2026-09-01T00:00:00.000Z',
                role: 'member',
                status: 'pending',
              },
            ],
            hasMoreMembers: false,
            hasMoreInvitations: false,
          },
        },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('Acme Engineering');
    expect(result.body).toContain('owner@example.com');
    expect(result.body).toContain('invitee@example.com');
    expect(result.body).toContain('Organization');
    expect(result.body).toContain('Send invitation');
    expect(result.body).toContain('Transfer ownership');
    expect(result.body).toContain('Save role');
    expect(result.body).toContain('Remove access');
    expect(result.body).toContain('Resend');
    expect(result.body).toContain('Revoke');
    expect(result.body).not.toContain('private-member-id');
    expect(result.body).not.toContain('private-invitation-id');
  });

  it('renders a restricted read-only state and an individual boundary', () => {
    const restricted = render(MembersPage, {
      props: {
        data: {
          organization: {
            status: 'restricted',
            organization: { ...organization, maxSeats: null, tier: null },
            members: [],
            invitations: [
              {
                email: 'invitee@example.com',
                expiresAt: '2026-09-01T00:00:00.000Z',
                role: 'member',
                status: 'pending',
              },
            ],
            hasMoreMembers: false,
            hasMoreInvitations: false,
          },
        },
        form: null,
        params: {},
      },
    });
    const individual = render(MembersPage, {
      props: {
        data: { organization: { status: 'no-organization' } },
        form: null,
        params: {},
      },
    });

    expect(restricted.body).toContain('Membership changes are paused');
    expect(restricted.body).not.toContain('Send invitation');
    expect(restricted.body).not.toContain('Resend');
    expect(restricted.body).not.toContain('Transfer ownership');
    expect(restricted.body).not.toContain('Save role');
    expect(restricted.body).toContain('Revoke');
    expect(restricted.body).toContain('Unavailable');
    expect(individual.body).toContain('Create an eligible Team or Enterprise workspace');
    expect(individual.body).not.toContain('Pending invitations');
  });
});
