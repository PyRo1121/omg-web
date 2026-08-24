import { Dialog, DropdownMenu } from '@kobalte/core';
import { A, useNavigate } from '@solidjs/router';
import { Keyboard, Menu, X } from 'lucide-solid';
import { type Component, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { useSession } from '~/lib/auth-client';

const NAV_ITEMS = [
  { href: '/docs/', label: 'Docs', external: true },
  { href: '/#features', label: 'System', external: false },
  { href: '/#benchmarks', label: 'Benchmarks', external: false },
  { href: '/#pricing', label: 'Plans', external: false },
  { href: 'https://github.com/PyRo1121/omg/', label: 'Source', external: true },
] as const;

const Header: Component = () => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  const navigate = useNavigate();
  const session = useSession();

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (event.key === 'd' && !event.ctrlKey && !event.metaKey) {
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

      <header class="relative z-30 border-b border-[var(--ink)] bg-[var(--paper)]">
        <nav
          class="manifest-shell grid min-h-18 grid-cols-[auto_1fr_auto] items-stretch"
          aria-label="Primary navigation"
        >
          <A
            href="/"
            class="flex items-center gap-3 border-r border-[var(--rule)] px-4 no-underline sm:px-6"
            aria-label="OMG Package Manager home"
          >
            <span class="grid h-9 w-9 place-items-center bg-[var(--ink)] font-mono text-sm font-semibold text-[var(--paper)]">
              O/
            </span>
            <span class="text-lg font-black tracking-[-0.04em]">OMG</span>
          </A>

          <div class="hidden items-stretch lg:flex">
            {NAV_ITEMS.map(item => (
              <a
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                class="manifest-label flex items-center border-r border-[var(--rule)] px-5 text-[var(--ink-muted)] no-underline hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div class="ml-auto flex items-stretch">
            <Dialog.Root open={shortcutsOpen()} onOpenChange={setShortcutsOpen}>
              <Dialog.Trigger
                class="hidden w-14 items-center justify-center border-l border-[var(--rule)] hover:bg-[var(--ink)] hover:text-[var(--paper)] sm:flex"
                aria-label="Keyboard shortcuts"
              >
                <Keyboard size={17} strokeWidth={1.6} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay class="fixed inset-0 z-40 bg-[rgba(21,21,20,0.55)]" />
                <div class="fixed inset-0 z-40 grid place-items-center p-4">
                  <Dialog.Content class="w-full max-w-lg border border-[var(--ink)] bg-[var(--paper-raised)]">
                    <div class="flex items-center justify-between border-b border-[var(--ink)] p-5">
                      <div>
                        <p class="manifest-label m-0 text-[var(--signal)]">Input reference</p>
                        <Dialog.Title class="mt-1 text-2xl font-black tracking-[-0.03em]">
                          Keyboard
                        </Dialog.Title>
                      </div>
                      <Dialog.CloseButton
                        class="grid h-10 w-10 place-items-center border border-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                        aria-label="Close keyboard shortcuts"
                      >
                        <X size={18} strokeWidth={1.6} />
                      </Dialog.CloseButton>
                    </div>
                    <Dialog.Description class="sr-only">
                      Keyboard shortcuts available on the OMG website.
                    </Dialog.Description>
                    <dl class="m-0 divide-y divide-[var(--rule)] font-mono text-sm">
                      <div class="grid grid-cols-[1fr_auto] p-5">
                        <dt>Open dashboard</dt>
                        <dd class="m-0">
                          <kbd class="border border-[var(--ink)] px-2 py-1">D</kbd>
                        </dd>
                      </div>
                      <div class="grid grid-cols-[1fr_auto] p-5">
                        <dt>Open this reference</dt>
                        <dd class="m-0">
                          <kbd class="border border-[var(--ink)] px-2 py-1">?</kbd>
                        </dd>
                      </div>
                      <div class="grid grid-cols-[1fr_auto] p-5">
                        <dt>Close an overlay</dt>
                        <dd class="m-0">
                          <kbd class="border border-[var(--ink)] px-2 py-1">ESC</kbd>
                        </dd>
                      </div>
                    </dl>
                  </Dialog.Content>
                </div>
              </Dialog.Portal>
            </Dialog.Root>

            <Show
              when={session()?.data?.user}
              fallback={
                <A
                  href="/login"
                  class="manifest-button hidden border-y-0 border-r-0 sm:inline-flex"
                >
                  Sign in
                </A>
              }
            >
              {user => (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="manifest-button hidden max-w-56 border-y-0 border-r-0 sm:inline-flex">
                    <span class="truncate">{user().email}</span>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="z-40 min-w-56 border border-[var(--ink)] bg-[var(--paper-raised)] p-1 font-mono text-xs shadow-none">
                      <DropdownMenu.Item
                        class="cursor-pointer px-3 py-2 outline-none data-[highlighted]:bg-[var(--ink)] data-[highlighted]:text-[var(--paper)]"
                        onSelect={() => navigate('/dashboard')}
                      >
                        Dashboard
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        as="a"
                        href="/api/auth/sign-out"
                        class="block cursor-pointer px-3 py-2 text-[var(--signal)] outline-none data-[highlighted]:bg-[var(--signal)] data-[highlighted]:text-[var(--paper)]"
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
              class="manifest-button manifest-button--primary hidden border-y-0 border-r-0 md:inline-flex"
            >
              Install
            </a>
            <button
              type="button"
              class="grid w-16 place-items-center border-l border-[var(--rule)] lg:hidden"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen() ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen()}
            >
              <Show when={menuOpen()} fallback={<Menu size={20} strokeWidth={1.6} />}>
                <X size={20} strokeWidth={1.6} />
              </Show>
            </button>
          </div>
        </nav>

        <Show when={menuOpen()}>
          <nav
            class="manifest-shell grid border-t border-[var(--ink)] lg:hidden"
            aria-label="Mobile"
          >
            {NAV_ITEMS.map(item => (
              <a
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                class="manifest-label border-b border-[var(--rule)] px-6 py-4 text-[var(--ink)] no-underline hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <Show
              when={session()?.data?.user}
              fallback={
                <A
                  href="/login"
                  class="manifest-label px-6 py-4"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in
                </A>
              }
            >
              <A
                href="/dashboard"
                class="manifest-label px-6 py-4"
                onClick={() => setMenuOpen(false)}
              >
                Dashboard
              </A>
            </Show>
          </nav>
        </Show>
      </header>
    </>
  );
};

export default Header;
