import { reportClientError } from '~/lib/observability';
import { Show, Suspense } from 'solid-js';
import { Title, Meta } from '@solidjs/meta';
import { A, createAsync, query, redirect, useNavigate } from '@solidjs/router';
import { clientOnly } from '@solidjs/start';
import { getRequestEvent } from 'solid-js/web';
import { LayoutDashboard, LogOut, Shield } from 'lucide-solid';
import { signOutBrowserSessions, useSession } from '~/lib/auth-client';
import { requireAdmin } from '~/lib/admin';

// The dashboard is an interactive, noindex surface whose TanStack Query
// fetches cannot run during SSR; rendering it client-only also keeps the SSR
// response stream from hanging open.
const AdminDashboard = clientOnly(() => import('~/components/dashboard/AdminDashboard'));

async function requireAdminPage(): Promise<{ readonly userId: string }> {
  'use server';

  const event = getRequestEvent();
  const cloudflareEnv = event?.nativeEvent.context.cloudflare?.env;
  if (event === undefined) {
    throw new Error('Admin authorization is unavailable');
  }
  if (cloudflareEnv?.DB === undefined) {
    // A visitor with no session cannot be an admin, even when a local or CI
    // environment has no D1 binding. Preserve the deployment error for any
    // request that does present authentication state.
    if (event.request.headers.get('cookie') === null) {
      throw redirect('/login');
    }
    throw new Error('Admin authorization is unavailable');
  }

  const authorization = await requireAdmin(event);
  if (authorization instanceof Response) {
    if (authorization.status === 401) {
      throw redirect('/login');
    }
    if (authorization.status === 403) {
      throw redirect('/dashboard');
    }
    throw new Error('Admin authorization is unavailable');
  }

  return { userId: authorization.userId };
}

const requireAdminPageQuery = query(requireAdminPage, 'admin-page-authorization');

function LoadingScreen() {
  return (
    <div class="grid min-h-screen place-items-center bg-[var(--paper)]">
      <div class="rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] p-8">
        <p class="font-mono text-xs text-[var(--signal)]">Admin authorization</p>
        <p class="mt-4 font-mono text-xs text-[var(--ink-muted)]">Loading control ledger…</p>
      </div>
    </div>
  );
}

function AuthorizedAdminPage() {
  const session = useSession();
  const navigate = useNavigate();
  const handleSignOut = async (): Promise<void> => {
    const result = await signOutBrowserSessions();
    if (result.failures.length > 0) {
      reportClientError(
        'Sign out incomplete:',
        result.failures.map(failure => failure._tag).join(', ')
      );
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <div class="min-h-screen bg-[var(--paper)] text-[var(--ink)]" data-ui="manifest-dashboard">
      <nav class="sticky top-0 z-30 border-b border-[var(--rule)] bg-[rgba(8,11,9,0.9)] backdrop-blur-xl">
        <div class="mx-auto flex max-w-[112rem] items-center justify-between px-4 py-3">
          <div class="flex items-stretch">
            <A href="/" class="manifest-button border-0 bg-transparent">
              <Shield class="h-4 w-4" strokeWidth={1.5} /> OMG Admin
            </A>
            <A href="/dashboard" class="manifest-button border-0 bg-transparent">
              <LayoutDashboard class="h-4 w-4" strokeWidth={1.5} /> Account
            </A>
          </div>
          <Show when={session()?.data?.user}>
            <div class="flex items-stretch">
              <span class="manifest-label hidden items-center px-4 text-[var(--ink-muted)] md:flex">
                {session()?.data?.user?.email}
              </span>
              <button onClick={handleSignOut} class="manifest-button">
                <LogOut class="h-4 w-4" strokeWidth={1.5} /> Sign out
              </button>
            </div>
          </Show>
        </div>
      </nav>

      <main class="mx-auto max-w-[112rem] px-6 py-10">
        <Suspense fallback={<LoadingScreen />}>
          <AdminDashboard />
        </Suspense>
      </main>
    </div>
  );
}

export default function AdminRoute() {
  // The deferred check streams the loading shell first and resolves once the
  // D1-backed authorization settles; unauthorized roles are redirected.
  const authorization = createAsync(() => requireAdminPageQuery(), { deferStream: true });

  return (
    <>
      <Title>Control Ledger - OMG Admin</Title>
      <Meta
        name="description"
        content="Manage OMG licenses, telemetry, revenue, and customer health."
      />
      <Meta name="robots" content="noindex, nofollow" />
      <Show when={authorization()} fallback={<LoadingScreen />}>
        <AuthorizedAdminPage />
      </Show>
    </>
  );
}
