import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DashboardPage from './+page.svelte';

const data = {
  user: {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  sessions: [],
  accounts: [],
  currentSessionExpiresAt: null,
  licensing: { status: 'unavailable' } as const,
};

describe('dashboard billing portal control', () => {
  it('renders a progressive Billing Portal form without accepting browser identity fields', () => {
    const result = render(DashboardPage, { props: { data, form: null, params: {} } });

    expect(result.body).toContain('action="?/openBillingPortal"');
    expect(result.body).toContain('Open billing settings');
    expect(result.body).not.toContain('name="email"');
    expect(result.body).not.toContain('billing.stripe.com');
  });

  it('renders a classified portal failure without transport details', () => {
    const result = render(DashboardPage, {
      props: {
        data,
        params: {},
        form: {
          kind: 'portal-error',
          message: 'No billing account is linked to this account.',
        },
      },
    });

    expect(result.body).toContain('role="alert"');
    expect(result.body).toContain('No billing account is linked to this account.');
    expect(result.body).not.toContain('LicensingSummaryWorkerRejected');
  });
});
