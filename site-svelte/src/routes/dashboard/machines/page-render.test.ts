import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MachinesPage from './+page.svelte';

const machines = {
  active: 1,
  allowance: 5,
  machines: [
    {
      hostname: 'workstation',
      operatingSystem: 'linux',
      architecture: 'x86_64',
      version: '1.2.3',
      firstSeenAt: '2026-08-01T00:00:00.000Z',
      lastSeenAt: '2026-08-28T12:00:00.000Z',
    },
  ],
};

describe('account machines page', () => {
  it('renders descriptive machine metadata without persistent identifiers', () => {
    const result = render(MachinesPage, {
      props: { data: { machines: { status: 'available', machines } }, form: null, params: {} },
    });

    expect(result.body).toContain('href="/dashboard/settings/"');
    expect(result.body).toContain('1 of 5 active');
    expect(result.body).toContain('workstation');
    expect(result.body).toContain('x86_64');
    expect(result.body).not.toContain('machine_id');
    expect(result.body).not.toContain('device-fingerprint');
    expect(result.body).not.toContain('license_key');
  });

  it('renders explicit empty and unavailable states', () => {
    const empty = render(MachinesPage, {
      props: {
        data: {
          machines: { status: 'available', machines: { active: 0, allowance: 5, machines: [] } },
        },
        form: null,
        params: {},
      },
    });
    const unavailable = render(MachinesPage, {
      props: { data: { machines: { status: 'unavailable' } }, form: null, params: {} },
    });

    expect(empty.body).toContain('No active machines have reported to this license.');
    expect(unavailable.body).toContain('Machine data is temporarily unavailable.');
  });
});
