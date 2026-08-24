import { createEffect, createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { Meta, Title } from '@solidjs/meta';
import { CircleAlert, LoaderCircle, Terminal } from 'lucide-solid';
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

  const handleOAuthSignup = async (provider: 'github' | 'google') => {
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

  const oauthButton =
    'flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-3 font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <>
      <Title>Sign Up - OMG Package Manager</Title>
      <Meta name="description" content="Create your OMG Package Manager account" />
      <Meta name="robots" content="noindex, nofollow" />

      <main class="relative min-h-screen overflow-x-hidden bg-[#0a0a0a] font-sans text-slate-200 selection:bg-blue-500/30 selection:text-blue-200">
        <div class="pointer-events-none fixed top-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-purple-600/10 blur-[120px]" />
        <div class="pointer-events-none fixed right-[-10%] bottom-[-20%] h-[50%] w-[50%] rounded-full bg-blue-600/10 blur-[120px]" />

        <div class="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
          <section class="animate-fade-in w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl md:p-12">
            <div class="mb-8 text-center">
              <div class="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
                <Terminal class="h-8 w-8 text-white" aria-hidden="true" />
              </div>
              <h1 class="mb-2 text-3xl font-bold tracking-tight text-white">Create account</h1>
              <p class="text-slate-400">Use a verified identity provider to get started.</p>
            </div>

            <div class="space-y-3">
              <button
                type="button"
                onClick={() => handleOAuthSignup('github')}
                disabled={providerLoading() !== null}
                class={oauthButton}
              >
                {providerLoading() === 'github' ? (
                  <LoaderCircle class="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <GitHubIcon class="h-5 w-5" />
                )}
                Continue with GitHub
              </button>
              <button
                type="button"
                onClick={() => handleOAuthSignup('google')}
                disabled={providerLoading() !== null}
                class={oauthButton}
              >
                {providerLoading() === 'google' ? (
                  <LoaderCircle class="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <GoogleIcon class="h-5 w-5" />
                )}
                Continue with Google
              </button>
            </div>

            {error() ? (
              <div
                role="alert"
                class="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400"
              >
                <CircleAlert class="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {error()}
              </div>
            ) : null}

            <p class="mt-6 text-center text-xs leading-relaxed text-slate-500">
              Email/password registration is disabled because this free-tier deployment cannot
              securely deliver arbitrary verification email.
            </p>

            <p class="mt-6 text-center text-sm text-slate-400">
              Already have an account?{' '}
              <A href="/login" class="font-medium text-blue-400 hover:text-blue-300">
                Sign in
              </A>
            </p>
          </section>

          <A href="/" class="mt-8 text-sm text-slate-500 transition-colors hover:text-white">
            ← Back to home
          </A>
        </div>
      </main>
    </>
  );
}
