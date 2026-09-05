import { beforeEach, describe, expect, it, vi } from 'vitest';
import { githubSignInError, type GitHubSocialSignIn } from './github-sign-in';
import { LoginView } from './login-view.svelte';
import { SignupView } from './signup-view.svelte';
import { SignOutView } from './sign-out.svelte';

const socialSignIn = vi.fn<GitHubSocialSignIn>();

beforeEach(() => {
  vi.resetAllMocks();
});

describe('githubSignInError', () => {
  it('starts the provider redirect with the requested callback', async () => {
    socialSignIn.mockResolvedValue({});

    await expect(
      githubSignInError(() => '/dashboard/', 'GitHub failed', socialSignIn)
    ).resolves.toBe('');
    expect(socialSignIn).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: '/dashboard/',
    });
  });

  it('returns provider messages and catches provider failures', async () => {
    socialSignIn.mockResolvedValueOnce({ error: { message: 'Provider rejected the request' } });
    await expect(
      githubSignInError(() => '/dashboard/', 'GitHub failed', socialSignIn)
    ).resolves.toBe('Provider rejected the request');

    socialSignIn.mockRejectedValueOnce(new Error('network failure'));
    await expect(
      githubSignInError(() => '/dashboard/', 'GitHub failed', socialSignIn)
    ).resolves.toBe('GitHub failed');
  });
});

describe('SignOutView', () => {
  it('navigates only after the server acknowledges sign-out', async () => {
    let destination = '';
    const view = new SignOutView(
      async () => ({ data: { success: true }, error: null }),
      path => {
        destination = path;
      }
    );
    await view.signOut();
    expect(destination).toBe('/');
    expect(view.error).toBe('');
  });

  it.each([
    { data: null, error: { message: 'Provider internals' } },
    { data: { success: false }, error: null },
    { data: { success: true }, error: { message: 'Conflicting response' } },
  ])('stays on the page for rejected or malformed acknowledgements', async result => {
    let destination = '';
    const view = new SignOutView(
      async () => result,
      path => {
        destination = path;
      }
    );
    await view.signOut();
    expect(destination).toBe('');
    expect(view.pending).toBe(false);
    expect(view.error).toBe('Could not sign out. Please try again.');
  });

  it('allows a successful retry after a network failure', async () => {
    let attempts = 0;
    let destination = '';
    const view = new SignOutView(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Private network details');
        return { data: { success: true }, error: null };
      },
      path => {
        destination = path;
      }
    );
    await view.signOut();
    expect(destination).toBe('');
    expect(view.error).toBe('Could not sign out. Please try again.');
    await view.signOut();
    expect(destination).toBe('/');
    expect(view.error).toBe('');
  });

  it('does not send another request while sign-out is pending', async () => {
    const acknowledgement = Promise.withResolvers<{ data: { success: boolean }; error: null }>();
    let requests = 0;
    const view = new SignOutView(
      () => {
        requests += 1;
        return acknowledgement.promise;
      },
      () => {}
    );
    const first = view.signOut();
    await view.signOut();
    expect(view.pending).toBe(true);
    acknowledgement.resolve({ data: { success: true }, error: null });
    await first;
    expect(requests).toBe(1);
  });
});

describe('LoginView and SignupView', () => {
  it('keeps login pending while the successful OAuth redirect is underway', async () => {
    socialSignIn.mockResolvedValue({});
    const view = new LoginView(() => '/account/', socialSignIn);

    const pending = view.github();
    expect(view.pending).toBe(true);
    await pending;

    expect(view.error).toBe('');
    expect(view.pending).toBe(true);
  });

  it('clears login pending and exposes a provider error', async () => {
    socialSignIn.mockResolvedValue({ error: { message: 'GitHub is unavailable' } });
    const view = new LoginView(undefined, socialSignIn);

    await view.github();

    expect(view.error).toBe('GitHub is unavailable');
    expect(view.pending).toBe(false);
  });

  it('uses the sign-up-specific fallback and clears pending on failure', async () => {
    socialSignIn.mockRejectedValue(new Error('network failure'));
    const view = new SignupView(undefined, socialSignIn);

    await view.github();

    expect(view.error).toBe('GitHub sign-up failed');
    expect(view.pending).toBe(false);
  });
});
