import { DropdownMenu } from '@kobalte/core';
import { A, useNavigate } from '@solidjs/router';
import { Menu, X } from 'lucide-solid';
import { type Component, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { useSession } from '~/lib/auth-client';

const NAV_ITEMS = [
  { href: '/#workflow', label: 'Workflow' },
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
        class="manifest-button fixed top-2 left-2 z-50 -translate-y-24 bg-[var(--paper-raised)] focus:translate-y-0"
      >
        Skip to content
      </a>

      <header class="border-b border-[var(--rule)] bg-[var(--paper)]">
        <nav class="manifest-shell flex h-18 items-center" aria-label="Primary navigation">
          <A
            href="/"
            class="flex shrink-0 items-center pr-6 text-[var(--ink)] no-underline"
            aria-label="OMG Package Manager home"
          >
            <span class="text-lg font-bold tracking-[-0.06em]">
              OMG<span class="text-[var(--signal)]">/</span>
            </span>
          </A>

          <ul class="ml-auto hidden list-none items-center gap-7 p-0 lg:flex">
            {NAV_ITEMS.map(item => (
              <li>
                <a
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  class="flex min-h-10 items-center font-mono text-[10px] tracking-[0.04em] text-[var(--ink-muted)] no-underline hover:text-[var(--ink)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <span class="ml-auto flex items-stretch lg:ml-0">
            <Show
              when={session()?.data?.user}
              fallback={
                <A
                  href="/login"
                  class="hidden min-h-10 items-center px-5 font-mono text-[10px] tracking-[0.04em] sm:flex"
                >
                  Sign in
                </A>
              }
            >
              {user => (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="hidden min-h-10 max-w-48 items-center px-5 font-mono text-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] sm:flex">
                    <span class="block truncate">{user().email}</span>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="z-40 min-w-52 border border-[var(--rule-strong)] bg-[var(--paper-raised)] p-1.5 text-sm shadow-[0_1.5rem_5rem_rgba(0,0,0,0.4)]">
                      <DropdownMenu.Item
                        class="cursor-pointer px-3 py-2 outline-none data-[highlighted]:bg-white/[0.07]"
                        onSelect={() => navigate('/dashboard')}
                      >
                        Dashboard
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        as="a"
                        href="/api/auth/sign-out"
                        class="block cursor-pointer px-3 py-2 text-[var(--danger)] outline-none data-[highlighted]:bg-white/[0.07]"
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
              class="hidden min-w-32 items-center justify-center bg-[var(--signal)] px-5 text-sm font-semibold text-[var(--signal-ink)] no-underline hover:bg-[var(--signal-hover)] sm:flex"
            >
              Install OMG
            </a>
            <button
              type="button"
              class="grid h-12 w-12 place-items-center hover:bg-[var(--paper-raised)] lg:hidden"
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
          <nav class="border-t border-[var(--rule)] py-3 lg:hidden" aria-label="Mobile navigation">
            <ul class="manifest-shell m-0 grid list-none grid-cols-2 gap-x-4 p-0">
              {NAV_ITEMS.map(item => (
                <li>
                  <a
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    class="block px-4 py-4 font-mono text-[11px] text-[var(--ink-muted)] no-underline hover:bg-[var(--paper-raised)] hover:text-[var(--ink)]"
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
                    <A href="/login" class="block px-4 py-4 font-mono text-[11px]">
                      Sign in
                    </A>
                  }
                >
                  <A href="/dashboard" class="block px-4 py-4 font-mono text-[11px]">
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
