import { createSignal, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { Title, Meta } from '@solidjs/meta';
import { signIn, useSession } from '~/lib/auth-client';
import { getErrorMessage } from '~/lib/error-message';
import { Terminal, Mail, CircleAlert, LoaderCircle } from 'lucide-solid';
import { GitHubIcon, GoogleIcon } from '~/components/ui/BrandIcons';

export default function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  if (session()?.data?.user) {
    navigate('/dashboard', { replace: true });
  }

  const handleEmailLogin = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn.email({
        email: email(),
        password: password(),
      });

      if (result.error) {
        setError(result.error.message || 'Login failed');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? getErrorMessage(err, 'An unexpected error occurred')
          : 'An unexpected error occurred'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    setLoading(true);
    setError('');

    try {
      await signIn.social({
        provider,
        callbackURL: '/dashboard',
      });
    } catch (err) {
      setError(
        err instanceof Error ? getErrorMessage(err, 'OAuth login failed') : 'OAuth login failed'
      );
      setLoading(false);
    }
  };

  const pageBg =
    'min-h-screen bg-[#0a0a0a] text-slate-200 font-sans selection:bg-blue-500/30 selection:text-blue-200 overflow-x-hidden relative';
  const glassPanel = 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl';
  const glassInput =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all';
  const glassButton =
    'w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
  const oauthButton =
    'w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all';

  return (
    <>
      <Title>Login - OMG Package Manager</Title>
      <Meta name="description" content="Sign in to your OMG Package Manager dashboard" />
      <Meta name="robots" content="noindex, nofollow" />

      <div class={pageBg}>
        <div class="pointer-events-none fixed top-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-blue-600/10 blur-[120px]" />
        <div class="pointer-events-none fixed right-[-10%] bottom-[-20%] h-[50%] w-[50%] rounded-full bg-purple-600/10 blur-[120px]" />
        <div class="pointer-events-none fixed top-[20%] right-[10%] h-[30%] w-[30%] rounded-full bg-cyan-600/5 blur-[100px]" />

        <div class="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
          <div class={`${glassPanel} animate-fade-in w-full max-w-md p-8 md:p-12`}>
            <div class="mb-8 text-center">
              <div class="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-500 shadow-lg shadow-blue-500/20">
                <Terminal class="h-8 w-8 text-white" />
              </div>
              <h1 class="mb-2 text-3xl font-bold tracking-tight text-white">Welcome back</h1>
              <p class="text-slate-400">Sign in to access your dashboard</p>
            </div>

            <div class="mb-6 space-y-3">
              <button
                type="button"
                onClick={() => handleOAuthLogin('github')}
                disabled={loading()}
                class={oauthButton}
              >
                <GitHubIcon class="h-5 w-5" />
                Continue with GitHub
              </button>
              <button
                type="button"
                onClick={() => handleOAuthLogin('google')}
                disabled={loading()}
                class={oauthButton}
              >
                <GoogleIcon class="h-5 w-5" />
                Continue with Google
              </button>
            </div>

            <div class="relative mb-6">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-white/10" />
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="bg-[#0a0a0a] px-4 text-slate-500">or continue with email</span>
              </div>
            </div>

            <form onSubmit={handleEmailLogin} class="space-y-4">
              <div>
                <label for="login-email" class="mb-2 ml-1 block text-sm font-medium text-slate-300">
                  Email Address
                </label>
                <div class="relative">
                  <Mail class="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    id="login-email"
                    type="email"
                    value={email()}
                    onInput={e => setEmail(e.currentTarget.value)}
                    placeholder="dev@example.com"
                    required
                    class={`${glassInput} pl-12`}
                  />
                </div>
              </div>

              <div>
                <label
                  for="login-password"
                  class="mb-2 ml-1 block text-sm font-medium text-slate-300"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password()}
                  onInput={e => setPassword(e.currentTarget.value)}
                  placeholder="Enter your password"
                  required
                  class={glassInput}
                />
              </div>

              <Show when={error()}>
                <div class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  <CircleAlert class="h-4 w-4 flex-shrink-0" />
                  {error()}
                </div>
              </Show>

              <button type="submit" disabled={loading()} class={glassButton}>
                {loading() ? (
                  <span class="flex items-center justify-center gap-2">
                    <LoaderCircle class="h-4 w-4 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div class="mt-6 text-center">
              <p class="text-sm text-slate-400">
                Don't have an account?{' '}
                <A href="/signup" class="font-medium text-blue-400 hover:text-blue-300">
                  Sign up
                </A>
              </p>
            </div>
          </div>

          <A href="/" class="mt-8 text-sm text-slate-500 transition-colors hover:text-white">
            ← Back to home
          </A>
        </div>
      </div>
    </>
  );
}
