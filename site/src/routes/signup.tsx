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
    if (session()?.data?.user) {
      navigate('/dashboard', { replace: true });
    }
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

      <main class="manifest-shell grid min-h-screen lg:grid-cols-[7fr_5fr]">
        <section
          class="flex items-center border-b border-[var(--ink)] bg-[var(--paper-raised)] p-6 sm:p-10 lg:border-r lg:border-b-0 lg:p-16"
          aria-labelledby="signup-title"
        >
          <div class="mx-auto w-full max-w-xl">
            <A href="/" class="mb-20 flex items-center gap-3 text-[var(--ink)] no-underline">
              <span class="grid h-10 w-10 place-items-center bg-[var(--ink)] font-mono text-sm font-semibold text-[var(--paper)]">
                O/
              </span>
              <strong class="text-xl">OMG</strong>
            </A>

            <p class="manifest-index">NEW ACCOUNT / OAUTH</p>
            <h1
              id="signup-title"
              class="mt-4 text-5xl leading-[0.9] font-black tracking-[-0.06em] uppercase sm:text-7xl"
            >
              Start with a verified identity.
            </h1>
            <p class="mt-6 max-w-lg text-[var(--ink-muted)]">
              Pick an identity provider. OMG creates the account and sends you directly to the
              workspace.
            </p>

            <div class="mt-10 grid sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleOAuthSignup('github')}
                disabled={providerLoading() !== null}
                class="manifest-button sm:border-r-0"
              >
                <Show
                  when={providerLoading() === 'github'}
                  fallback={<GitHubIcon class="h-5 w-5" />}
                >
                  <LoaderCircle class="h-5 w-5 animate-spin" />
                </Show>
                Continue with GitHub
              </button>
              <button
                type="button"
                onClick={() => void handleOAuthSignup('google')}
                disabled={providerLoading() !== null}
                class="manifest-button"
              >
                <Show
                  when={providerLoading() === 'google'}
                  fallback={<GoogleIcon class="h-5 w-5" />}
                >
                  <LoaderCircle class="h-5 w-5 animate-spin" />
                </Show>
                Continue with Google
              </button>
            </div>

            <Show when={error()}>
              <div
                role="alert"
                class="mt-5 flex items-start gap-3 border border-[var(--danger)] bg-[#fff1ee] p-4 text-sm text-[var(--danger)]"
              >
                <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" /> {error()}
              </div>
            </Show>

            <p class="mt-8 font-mono text-xs text-[var(--ink-muted)]">
              Existing account?{' '}
              <A href="/login" class="font-semibold text-[var(--signal)]">
                Sign in
              </A>
            </p>
          </div>
        </section>

        <aside class="flex flex-col justify-between bg-[var(--ink)] p-6 text-[var(--paper-raised)] sm:p-10">
          <span class="manifest-label text-[#aaa59a]">AUTH POLICY / 02</span>
          <div class="my-24">
            <p class="text-4xl leading-tight font-semibold tracking-[-0.045em]">
              Public password registration is deliberately unavailable.
            </p>
            <p class="mt-6 text-sm leading-relaxed text-[#aaa59a]">
              This deployment accepts OAuth identities so every new account starts with a verified
              email address.
            </p>
          </div>
          <A href="/" class="manifest-label text-[var(--paper-raised)]">
            ← Return home
          </A>
        </aside>
      </main>
    </>
  );
}
