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
    if (session()?.data?.user) {
      navigate('/dashboard', { replace: true });
    }
  });

  const handleEmailLogin = async (event: Event): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn.email({ email: email(), password: password() });
      if (result.error) {
        setError(result.error.message || 'Login failed');
      } else {
        navigate('/dashboard');
      }
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
      if (result?.error) {
        setError(result.error.message || 'OAuth login failed');
      }
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? getErrorMessage(cause, 'OAuth login failed') : 'OAuth login failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-[var(--ink)] bg-[var(--paper-raised)] px-4 py-3 font-mono text-sm placeholder:text-[var(--ink-muted)]';

  return (
    <>
      <Title>Login - OMG Package Manager</Title>
      <Meta name="description" content="Sign in to your OMG Package Manager dashboard" />
      <Meta name="robots" content="noindex, nofollow" />

      <main class="manifest-shell grid min-h-screen lg:grid-cols-[5fr_7fr]">
        <section class="flex flex-col justify-between border-b border-[var(--ink)] bg-[var(--signal)] p-6 text-[var(--paper-raised)] sm:p-10 lg:border-r lg:border-b-0">
          <A href="/" class="flex items-center gap-3 text-[var(--paper-raised)] no-underline">
            <span class="grid h-10 w-10 place-items-center bg-[var(--paper-raised)] font-mono text-sm font-semibold text-[var(--signal)]">
              O/
            </span>
            <strong class="text-xl">OMG</strong>
          </A>
          <div class="my-24 lg:my-0">
            <p class="manifest-label">ACCOUNT ACCESS / 01</p>
            <h1 class="mt-5 text-6xl leading-[0.86] font-black tracking-[-0.065em] uppercase sm:text-8xl">
              Return to your workspace.
            </h1>
          </div>
          <p class="font-mono text-xs text-[#fae0dc]">Packages / runtimes / fleet operations</p>
        </section>

        <section
          class="flex items-center bg-[var(--paper-raised)] p-6 sm:p-10 lg:p-16"
          aria-labelledby="login-form-title"
        >
          <div class="mx-auto w-full max-w-xl">
            <p class="manifest-index">SIGN IN</p>
            <h2 id="login-form-title" class="mt-3 text-4xl font-black tracking-[-0.05em] uppercase">
              Welcome back
            </h2>
            <p class="mt-3 text-[var(--ink-muted)]">
              Choose a verified identity provider or use an existing controlled account.
            </p>

            <div class="mt-10 grid sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleOAuthLogin('github')}
                disabled={loading()}
                class="manifest-button sm:border-r-0"
                aria-label="Continue with GitHub"
              >
                <GitHubIcon class="h-5 w-5" /> GitHub
              </button>
              <button
                type="button"
                onClick={() => void handleOAuthLogin('google')}
                disabled={loading()}
                class="manifest-button"
                aria-label="Continue with Google"
              >
                <GoogleIcon class="h-5 w-5" /> Google
              </button>
            </div>

            <div class="manifest-label my-8 flex items-center gap-4 text-[var(--ink-muted)]">
              <span class="h-px flex-1 bg-[var(--rule)]" /> Existing account{' '}
              <span class="h-px flex-1 bg-[var(--rule)]" />
            </div>

            <form onSubmit={event => void handleEmailLogin(event)} class="space-y-5">
              <label class="block" for="login-email">
                <span class="manifest-label mb-2 block text-[var(--ink-muted)]">Email address</span>
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
                <span class="manifest-label mb-2 block text-[var(--ink-muted)]">Password</span>
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
                <div
                  role="alert"
                  class="flex items-start gap-3 border border-[var(--danger)] bg-[#fff1ee] p-4 text-sm text-[var(--danger)]"
                >
                  <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" /> {error()}
                </div>
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

            <p class="mt-8 font-mono text-xs text-[var(--ink-muted)]">
              Need an account?{' '}
              <A href="/signup" class="font-semibold text-[var(--signal)]">
                Sign up
              </A>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
