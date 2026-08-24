import { Meta, Title } from '@solidjs/meta';
import { A, useNavigate } from '@solidjs/router';
import { CircleAlert, LoaderCircle, Mail } from 'lucide-solid';
import { createEffect, createSignal, Show } from 'solid-js';
import { GitHubIcon, GoogleIcon } from '~/components/ui/BrandIcons';
import { signIn, useSession } from '~/lib/auth-client';
import { getErrorMessage } from '~/lib/error-message';

export default function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  createEffect(() => {
    if (session()?.data?.user) navigate('/dashboard', { replace: true });
  });

  const handleEmailLogin = async (event: Event): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn.email({ email: email(), password: password() });
      if (result.error) setError(result.error.message || 'Login failed');
      else navigate('/dashboard');
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? getErrorMessage(cause, 'An unexpected error occurred')
          : 'An unexpected error occurred'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'github' | 'google'): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const result = await signIn.social({ provider, callbackURL: '/dashboard' });
      if (result?.error) setError(result.error.message || 'OAuth login failed');
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? getErrorMessage(cause, 'OAuth login failed') : 'OAuth login failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[var(--rule-strong)] bg-white/[0.035] px-4 py-3.5 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--signal)] focus:outline-none';

  return (
    <>
      <Title>Login - OMG Package Manager</Title>
      <Meta name="description" content="Sign in to your OMG Package Manager dashboard" />
      <Meta name="robots" content="noindex, nofollow" />

      <main class="manifest-shell grid min-h-[100dvh] items-center gap-14 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-28">
        <header class="max-w-xl">
          <A href="/" class="mb-20 flex items-center gap-3 text-[var(--ink)] no-underline">
            <span class="grid h-10 w-10 place-items-center rounded-full bg-[var(--signal)] font-mono text-sm font-semibold text-[var(--signal-ink)]">
              O/
            </span>
            <strong class="text-xl tracking-[-0.035em]">OMG</strong>
          </A>
          <p class="font-mono text-xs text-[var(--signal)]">Account access</p>
          <h1 class="mt-6 text-6xl leading-[0.9] font-medium tracking-[-0.065em] sm:text-8xl">
            Pick up where you left off.
          </h1>
          <p class="mt-7 max-w-md text-lg leading-relaxed text-[var(--ink-muted)]">
            Licenses, machines, package telemetry, and team operations in one place.
          </p>
        </header>

        <section class="mx-auto w-full max-w-xl" aria-labelledby="login-form-title">
          <h2 id="login-form-title" class="text-4xl font-medium tracking-[-0.045em]">
            Welcome back
          </h2>
          <p class="mt-3 text-[var(--ink-muted)]">
            Use a verified provider or an existing controlled account.
          </p>

          <p class="mt-9 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleOAuthLogin('github')}
              disabled={loading()}
              class="manifest-button"
              aria-label="Continue with GitHub"
            >
              <GitHubIcon class="h-5 w-5" /> Continue with GitHub
            </button>
            <button
              type="button"
              onClick={() => void handleOAuthLogin('google')}
              disabled={loading()}
              class="manifest-button"
              aria-label="Continue with Google"
            >
              <GoogleIcon class="h-5 w-5" /> Continue with Google
            </button>
          </p>

          <p class="my-8 flex items-center gap-4 font-mono text-[10px] text-[var(--ink-muted)]">
            <span class="h-px flex-1 bg-[var(--rule)]" /> existing account{' '}
            <span class="h-px flex-1 bg-[var(--rule)]" />
          </p>

          <form onSubmit={event => void handleEmailLogin(event)} class="space-y-5">
            <label class="block" for="login-email">
              <span class="mb-2 block text-sm text-[var(--ink-muted)]">Email address</span>
              <span class="relative block">
                <Mail
                  class="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
                  size={16}
                  strokeWidth={1.5}
                />
                <input
                  id="login-email"
                  type="email"
                  value={email()}
                  onInput={event => setEmail(event.currentTarget.value)}
                  autocomplete="email"
                  required
                  class={`${inputClass} pl-10`}
                />
              </span>
            </label>
            <label class="block" for="login-password">
              <span class="mb-2 block text-sm text-[var(--ink-muted)]">Password</span>
              <input
                id="login-password"
                type="password"
                value={password()}
                onInput={event => setPassword(event.currentTarget.value)}
                autocomplete="current-password"
                required
                class={inputClass}
              />
            </label>

            <Show when={error()}>
              <p
                role="alert"
                class="flex items-start gap-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/8 p-4 text-sm text-[var(--danger)]"
              >
                <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" /> {error()}
              </p>
            </Show>

            <button
              type="submit"
              disabled={loading()}
              class="manifest-button manifest-button--primary w-full"
            >
              <Show when={loading()} fallback="Sign in">
                <LoaderCircle class="h-4 w-4 animate-spin" /> Signing in
              </Show>
            </button>
          </form>

          <p class="mt-8 text-sm text-[var(--ink-muted)]">
            Need an account?{' '}
            <A href="/signup" class="font-semibold text-[var(--signal)]">
              Sign up
            </A>
          </p>
        </section>
      </main>
    </>
  );
}
