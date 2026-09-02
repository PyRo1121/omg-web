import { beforeEach, describe, expect, it, vi } from 'vitest';
import { githubSignInError, type GitHubSocialSignIn } from './github-sign-in';
import { LoginView } from './login-view.svelte';
import { SignupView } from './signup-view.svelte';

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
