import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import OrganizationSupportPage from './+page.svelte';

function pageData() {
  return {
    operatorName: 'Operator',
    support: {
      organization: { name: 'Acme Engineering', slug: 'acme-engineering' },
      entitlement: { tier: 'team' as const, licenseStatus: 'active', access: 'active' as const },
      seats: { used: 2, limit: 5 },
      members: [
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          role: 'owner' as const,
          joinedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      hasMoreMembers: false,
      invitations: [
        {
          email: 'grace@example.com',
          role: 'member' as const,
          status: 'pending' as const,
          expiresAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      hasMoreInvitations: false,
      usage: {
        windowDays: 30 as const,
        activeDays: 6,
        totals: {
          commands: 120,
          packagesInstalled: 8,
          packagesSearched: 14,
          runtimeSwitches: 3,
          sbomsGenerated: 2,
          vulnerabilitiesFound: 4,
          timeSavedMs: 900000,
        },
      },
      fleet: {
        activeMachines: 3,
        seenWithinSevenDays: 2,
        notSeenWithinSevenDays: 1,
        versions: [{ version: '1.4.0', machines: 3 }],
        hasMoreVersions: false,
      },
      audit: {
        events: [
          {
            action: 'organization.invitation.created' as const,
            role: 'member' as const,
            occurredAt: '2026-08-29T12:00:00.000Z',
          },
        ],
        hasMoreEvents: false,
      },
    },
  };
}

describe('operator organization support workspace', () => {
  it('renders entitlement, people, usage, fleet, and audit without private identifiers', () => {
    const result = render(OrganizationSupportPage, {
      props: { data: pageData(), form: null, params: {} },
    });

    expect(result.head).toContain('noindex, nofollow');
    expect(result.body).toContain('Acme Engineering');
    expect(result.body).toContain('acme-engineering');
    expect(result.body).toContain('Ada Lovelace');
    expect(result.body).toContain('ada@example.com');
    expect(result.body).toContain('grace@example.com');
    expect(result.body).toContain('30-day activity');
    expect(result.body).toContain('120');
    expect(result.body).toContain('1.4.0');
    expect(result.body).toContain('Invitation created');
    expect(result.body).not.toContain('private-organization-id');
    expect(result.body).not.toContain('private-license-key');
    expect(result.body).not.toContain('private-member-id');
    expect(result.body).not.toContain('private-invitation-id');
    expect(result.body).not.toContain('machine-id');
  });
});
