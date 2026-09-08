import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SettingsPage from './+page.svelte';

const dashboard = {
  user: {
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  sessions: [
    {
      ipAddress: null,
      userAgent: 'Helium',
      createdAt: '2026-08-28T10:00:00.000Z',
      expiresAt: '2026-09-28T10:00:00.000Z',
      isCurrent: true,
    },
  ],
  accounts: [{ provider: 'github' }],
};

describe('account settings page', () => {
  it('renders identity and session controls without billing actions', () => {
    const result = render(SettingsPage, {
      props: { data: { dashboard }, form: null, params: {} },
    });

    expect(result.body).toContain('Account settings');
    expect(result.body).toContain('GitHub');
    expect(result.body).toContain('Current session');
    expect(result.body).not.toContain('openBillingPortal');
    expect(result.body).not.toContain('Billing');
    expect(result.body).not.toContain('Stripe');
    expect(result.body).toContain('type="button"');
    expect(result.body).toContain('Sign out');
    expect(result.body).not.toContain('session-current');
    expect(result.body).not.toContain('github-ada');
    expect(result.body).not.toContain('user-1');
  });
});
