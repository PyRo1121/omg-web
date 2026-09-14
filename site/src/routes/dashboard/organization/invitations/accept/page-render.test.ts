import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AcceptInvitationPage from './+page.svelte';

describe('organization invitation acceptance page', () => {
  it('renders a verified acceptance action without exposing invitation references', () => {
    const result = render(AcceptInvitationPage, {
      props: {
        data: { invitation: { status: 'ready' } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('Join your organization workspace.');
    expect(result.body).toContain('Accept invitation');
    expect(result.body).toContain('Decline invitation');
    expect(result.body).not.toContain('invitation-private-id');
    expect(result.body).not.toContain('token=');
  });

  it('renders the same neutral unavailable state for invalid references', () => {
    const result = render(AcceptInvitationPage, {
      props: {
        data: { invitation: { status: 'invalid' } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('This invitation is no longer available.');
    expect(result.body).not.toContain('invitation-private-id');
  });
});
