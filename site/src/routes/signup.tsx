import { Meta, Title } from '@solidjs/meta';
import { A, useNavigate } from '@solidjs/router';
import { CircleAlert, LoaderCircle } from 'lucide-solid';
import { createEffect, createSignal, Show } from 'solid-js';
import { GitHubIcon, GoogleIcon } from '~/components/ui/BrandIcons';
import { signIn, useSession } from '~/lib/auth-client';
import { getErrorMessage } from '~/lib/error-message';

export default function SignupPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [providerLoading, setProviderLoading] = createSignal<'github' | 'google' | null>(null);
  const [error, setError] = createSignal('');

  createEffect(() => {
    if (session()?.data?.user) navigate('/dashboard', { replace: true });
  });

  const handleOAuthSignup = async (provider: 'github' | 'google'): Promise<void> => {
    setProviderLoading(provider);
    setError('');
    try {
      const result = await signIn.social({ provider, callbackURL: '/dashboard' });
      if (result?.error) {
        setError(result.error.message || 'Signup failed');
        setProviderLoading(null);
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? getErrorMessage(cause, 'Signup failed') : 'Signup failed');
      setProviderLoading(null);
    }
  };

  return (
    <>
      <Title>Sign Up - OMG Package Manager</Title>
      <Meta name="description" content="Create your OMG Package Manager account" />
      <Meta name="robots" content="noindex, nofollow" />

      <main class="manifest-shell grid min-h-[100dvh] items-center gap-14 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-28">
        <section class="max-w-2xl" aria-labelledby="signup-title">
          <A href="/" class="mb-20 inline-block text-[var(--ink)] no-underline">
            <strong class="text-xl tracking-[-0.055em]">
              OMG<span class="text-[var(--signal)]">/</span>
            </strong>
          </A>
          <p class="font-mono text-xs text-[var(--signal)]">New account</p>
          <h1
            id="signup-title"
            class="mt-6 text-6xl leading-[0.9] font-medium tracking-[-0.065em] sm:text-8xl"
          >
            Bring your toolchain into focus.
          </h1>
          <p class="mt-7 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)]">
            Create an account with a verified identity. No public password registration and no
            unverified inboxes.
          </p>
        </section>

        <section aria-label="Choose an identity provider">
          <h2 class="text-3xl font-medium tracking-[-0.04em]">Continue with</h2>
          <p class="mt-8 grid gap-3">
            <button
              type="button"
              onClick={() => void handleOAuthSignup('github')}
              disabled={providerLoading() !== null}
              class="manifest-button justify-start px-5"
            >
              <Show when={providerLoading() === 'github'} fallback={<GitHubIcon class="h-5 w-5" />}>
                <LoaderCircle class="h-5 w-5 animate-spin" />
              </Show>
              Continue with GitHub
            </button>
            <button
              type="button"
              onClick={() => void handleOAuthSignup('google')}
              disabled={providerLoading() !== null}
              class="manifest-button justify-start px-5"
            >
              <Show when={providerLoading() === 'google'} fallback={<GoogleIcon class="h-5 w-5" />}>
                <LoaderCircle class="h-5 w-5 animate-spin" />
              </Show>
              Continue with Google
            </button>
          </p>

          <Show when={error()}>
            <p
              role="alert"
              class="mt-5 flex items-start gap-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/8 p-4 text-sm text-[var(--danger)]"
            >
              <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" /> {error()}
            </p>
          </Show>

          <p class="mt-8 text-sm text-[var(--ink-muted)]">
            Existing account?{' '}
            <A href="/login" class="font-semibold text-[var(--signal)]">
              Sign in
            </A>
          </p>
          <p class="mt-12 border-t border-[var(--rule)] pt-5 text-xs leading-relaxed text-[#69736b]">
            OAuth-only registration ensures every public account begins with a verified email
            address.
          </p>
        </section>
      </main>
    </>
  );
}
