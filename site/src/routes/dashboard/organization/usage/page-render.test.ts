import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { OrganizationUsageResponse } from '../../../../../../shared/organization-usage';
import OrganizationUsagePage from './+page.svelte';

const USAGE: OrganizationUsageResponse = {
  organization: { name: 'Acme Engineering', role: 'owner', status: 'active', tier: 'team' },
  seats: { used: 2, limit: 5 },
  windowDays: 30,
  members: [
    {
      email: 'owner@example.com',
      name: 'Owner',
      role: 'owner',
      attributedMachines: 1,
      usage: { commands: 10, packagesInstalled: 2, runtimeSwitches: 1, timeSavedMs: 500 },
    },
  ],
  hasMoreMembers: false,
  unattributed: {
    machines: 1,
    usage: { commands: 3, packagesInstalled: 0, runtimeSwitches: 1, timeSavedMs: 100 },
  },
  fleet: {
    activeMachines: 2,
    seenWithinSevenDays: 1,
    notSeenWithinSevenDays: 1,
    versions: [
      { version: '1.2.3', machines: 1 },
      { version: null, machines: 1 },
    ],
    hasMoreVersions: false,
  },
};

describe('organization usage page', () => {
  it('renders grounded member and unattributed usage without private identifiers', () => {
    const result = render(OrganizationUsagePage, {
      props: {
        data: { organizationUsage: { status: 'available', usage: USAGE } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('Acme Engineering');
    expect(result.body).toContain('Member-attributed usage');
    expect(result.body).toContain('owner@example.com');
    expect(result.body).toContain('Unattributed fleet usage');
    expect(result.body).toContain('OMG does not invent an employee assignment');
    expect(result.body).toContain('Seen within 7 days');
    expect(result.body).toContain('Not seen within 7 days');
    expect(result.body).toContain('Unreported');
    expect(result.body).not.toContain('private-organization-id');
    expect(result.body).not.toContain('private-user-id');
    expect(result.body).not.toContain('machine-row');
    expect(result.body).not.toContain('license-key');
  });

  it('preserves restricted reads and explicit unavailable states', () => {
    const restricted = render(OrganizationUsagePage, {
      props: {
        data: {
          organizationUsage: {
            status: 'available',
            usage: {
              ...USAGE,
              organization: { ...USAGE.organization, status: 'restricted' },
            },
          },
        },
        form: null,
        params: {},
      },
    });
    const unavailable = render(OrganizationUsagePage, {
      props: {
        data: { organizationUsage: { status: 'unavailable' } },
        form: null,
        params: {},
      },
    });

    expect(restricted.body).toContain('Shared usage remains readable');
    expect(unavailable.body).toContain('Organization usage is temporarily unavailable');
  });
});
