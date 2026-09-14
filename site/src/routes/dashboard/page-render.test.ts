import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DashboardPage from './+page.svelte';

const data = {
  user: {
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  licensing: { status: 'unavailable' } as const,
};

describe('account overview page', () => {
  it('renders capability navigation and only the overview projection', () => {
    const result = render(DashboardPage, { props: { data, form: null, params: {} } });

    expect(result.body).toContain('href="/dashboard/analytics/"');
    expect(result.body).toContain('href="/dashboard/achievements/"');
    expect(result.body).toContain('href="/dashboard/machines/"');
    expect(result.body).toContain('href="/dashboard/settings/"');
    expect(result.body).not.toContain('Open billing settings');
    expect(result.body).not.toContain('Connected identities');
    expect(result.body).not.toContain('Current session');
    expect(result.body).not.toContain('user-1');
  });
});
