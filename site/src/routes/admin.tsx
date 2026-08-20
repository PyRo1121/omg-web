import { lazy, Show, Suspense } from 'solid-js';
import { Title, Meta } from '@solidjs/meta';
import { A, createAsync, redirect } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import { LayoutDashboard, LogOut, Shield } from 'lucide-solid';
import { signOut, useSession } from '~/lib/auth-client';
import { requireAdmin } from '~/lib/admin';

const AdminDashboard = lazy(() => import('~/components/dashboard/AdminDashboard'));

async function requireAdminPage(): Promise<{ readonly userId: string }> {
  'use server';

  const event = getRequestEvent();
  if (event === undefined) {
    throw redirect('/login');
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

function LoadingScreen() {
  return (
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
      <div class="text-center">
        <div class="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p class="mt-4 text-sm font-medium text-slate-400">Loading Mission Control...</p>
      </div>
    </div>
  );
}

async function handleSignOut(): Promise<void> {
  try {
    await signOut();
    window.location.href = '/';
  } catch (cause: unknown) {
    console.error('Sign out error:', cause);
  }
}

function AuthorizedAdminPage() {
  const session = useSession();

  return (
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
      <nav class="sticky top-0 z-50 border-b border-white/10 bg-slate-900/80 backdrop-blur-xl">
        <div class="mx-auto px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-8">
              <A href="/" class="flex items-center gap-2 text-2xl font-bold">
                <Shield class="h-6 w-6 text-indigo-400" />
                <span class="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  OMG Admin
                </span>
              </A>
              <A
                href="/dashboard"
                class="flex items-center gap-2 text-slate-400 transition-colors hover:text-white"
              >
                <LayoutDashboard class="h-4 w-4" />
                User Dashboard
              </A>
            </div>
            <div class="flex items-center gap-4">
              <Show when={session()?.data?.user}>
                <span class="text-sm text-slate-300">{session()?.data?.user?.email}</span>
                <button
                  onClick={handleSignOut}
                  class="flex items-center gap-2 rounded-xl bg-red-600/20 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-600/30"
                >
                  <LogOut class="h-4 w-4" />
                  Sign Out
                </button>
              </Show>
            </div>
          </div>
        </div>
      </nav>

      <main class="mx-auto max-w-[1800px] px-6 py-8">
        <Suspense fallback={<LoadingScreen />}>
          <AdminDashboard />
        </Suspense>
      </main>
    </div>
  );
}

export default function AdminRoute() {
  const authorization = createAsync(() => requireAdminPage());

  return (
    <>
      <Title>Mission Control - OMG Admin</Title>
      <Meta name="robots" content="noindex, nofollow" />
      <Show when={authorization()} fallback={<LoadingScreen />}>
        <AuthorizedAdminPage />
      </Show>
    </>
  );
}
