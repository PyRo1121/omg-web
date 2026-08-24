import { DropdownMenu } from '@kobalte/core';
import { A, useNavigate } from '@solidjs/router';
import { Menu, X } from 'lucide-solid';
import { type Component, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { useSession } from '~/lib/auth-client';

const NAV_ITEMS = [
  { href: '/#features', label: 'Why OMG' },
  { href: '/#benchmarks', label: 'Speed' },
  { href: '/#pricing', label: 'Plans' },
  { href: '/docs/', label: 'Docs' },
  { href: 'https://github.com/PyRo1121/omg/', label: 'GitHub' },
] as const;

const Header: Component = () => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const navigate = useNavigate();
  const session = useSession();

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'd' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        navigate('/dashboard');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <>
      <a
        href="#main-content"
        class="manifest-button fixed top-3 left-3 z-50 -translate-y-24 bg-[var(--paper-raised)] focus:translate-y-0"
      >
        Skip to content
      </a>

      <header class="fixed inset-x-0 top-3 z-30 px-3">
        <nav
          class="mx-auto flex h-15 max-w-6xl items-center rounded-full border border-[var(--rule)] bg-[rgba(8,11,9,0.82)] px-2 shadow-[0_1rem_4rem_rgba(0,0,0,0.24)] backdrop-blur-xl"
          aria-label="Primary navigation"
        >
          <A
            href="/"
            class="flex items-center gap-2 rounded-full px-3 py-2 text-[var(--ink)] no-underline"
            aria-label="OMG Package Manager home"
          >
            <span class="grid h-8 w-8 place-items-center rounded-full bg-[var(--signal)] font-mono text-xs font-semibold text-[var(--signal-ink)]">
              O/
            </span>
            <span class="text-base font-semibold tracking-[-0.035em]">OMG</span>
          </A>

          <ul class="mx-auto hidden list-none items-center gap-1 p-0 lg:flex">
            {NAV_ITEMS.map(item => (
              <li>
                <a
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  class="block rounded-full px-3 py-2 text-xs font-medium text-[var(--ink-muted)] no-underline hover:bg-white/[0.06] hover:text-[var(--ink)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <span class="ml-auto flex items-center gap-1">
            <Show
              when={session()?.data?.user}
              fallback={
                <A href="/login" class="hidden rounded-full px-3 py-2 text-xs font-medium sm:block">
                  Sign in
                </A>
              }
            >
              {user => (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="hidden max-w-48 rounded-full px-3 py-2 text-xs text-[var(--ink-muted)] hover:bg-white/[0.06] hover:text-[var(--ink)] sm:block">
                    <span class="block truncate">{user().email}</span>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="z-40 min-w-52 rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] p-1.5 text-sm shadow-[0_1.5rem_5rem_rgba(0,0,0,0.4)]">
                      <DropdownMenu.Item
                        class="cursor-pointer rounded-xl px-3 py-2 outline-none data-[highlighted]:bg-white/[0.07]"
                        onSelect={() => navigate('/dashboard')}
                      >
                        Dashboard
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        as="a"
                        href="/api/auth/sign-out"
                        class="block cursor-pointer rounded-xl px-3 py-2 text-[var(--danger)] outline-none data-[highlighted]:bg-white/[0.07]"
                      >
                        Sign out
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </Show>

            <a
              href="/#install"
              class="manifest-button manifest-button--primary hidden sm:inline-flex"
            >
              Install
            </a>
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-full hover:bg-white/[0.06] lg:hidden"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen() ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen()}
            >
              <Show when={menuOpen()} fallback={<Menu size={19} strokeWidth={1.5} />}>
                <X size={19} strokeWidth={1.5} />
              </Show>
            </button>
          </span>
        </nav>

        <Show when={menuOpen()}>
          <nav
            class="mx-auto mt-2 max-w-6xl rounded-3xl border border-[var(--rule)] bg-[rgba(8,11,9,0.96)] p-3 shadow-[0_1.5rem_5rem_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden"
            aria-label="Mobile navigation"
          >
            <ul class="m-0 grid list-none p-0 sm:grid-cols-2">
              {NAV_ITEMS.map(item => (
                <li>
                  <a
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    class="block rounded-2xl px-4 py-3 text-sm text-[var(--ink-muted)] no-underline hover:bg-white/[0.06] hover:text-[var(--ink)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <Show
                  when={session()?.data?.user}
                  fallback={
                    <A href="/login" class="block rounded-2xl px-4 py-3 text-sm">
                      Sign in
                    </A>
                  }
                >
                  <A href="/dashboard" class="block rounded-2xl px-4 py-3 text-sm">
                    Dashboard
                  </A>
                </Show>
              </li>
            </ul>
          </nav>
        </Show>
      </header>
    </>
  );
};

export default Header;
