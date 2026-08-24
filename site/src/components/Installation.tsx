import { Tabs } from '@kobalte/core';
import { Check, Copy } from 'lucide-solid';
import type { Component } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';

const INSTALL_OPTIONS = [
  {
    id: 'curl',
    label: 'Linux / macOS',
    command: 'curl -fsSL https://omg.latham.cloud/install.sh | bash',
  },
  { id: 'windows', label: 'Windows', command: 'irm https://omg.latham.cloud/install.ps1 | iex' },
  { id: 'arch', label: 'Arch / AUR', command: 'yay -S omg-bin' },
  { id: 'scoop', label: 'Scoop', command: 'scoop install omg' },
] as const;

type InstallOption = (typeof INSTALL_OPTIONS)[number];
type InstallTabId = InstallOption['id'];

const isInstallTabId = (value: string): value is InstallTabId =>
  INSTALL_OPTIONS.some(option => option.id === value);

const commandFor = (id: InstallTabId): string =>
  INSTALL_OPTIONS.find(option => option.id === id)?.command ?? INSTALL_OPTIONS[0].command;

const Installation: Component = () => {
  const [activeTab, setActiveTab] = createSignal<InstallTabId>('curl');
  const [copied, setCopied] = createSignal(false);
  let resetTimer: number | undefined;

  const copyCommand = async (): Promise<void> => {
    await navigator.clipboard.writeText(commandFor(activeTab()));
    setCopied(true);
    if (resetTimer !== undefined) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => setCopied(false), 1800);
  };

  onCleanup(() => {
    if (resetTimer !== undefined) window.clearTimeout(resetTimer);
  });

  return (
    <section
      id="install"
      class="border-y border-[var(--rule)] py-28 sm:py-36"
      aria-labelledby="install-title"
    >
      <div class="manifest-shell">
        <header class="max-w-4xl">
          <h2
            id="install-title"
            class="text-5xl leading-[0.94] font-medium tracking-[-0.055em] sm:text-7xl"
          >
            Go from zero to installed.
          </h2>
          <p class="mt-7 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)]">
            Choose your platform. Inspect the script before it runs.
          </p>
        </header>

        <Tabs.Root
          value={activeTab()}
          onChange={value => {
            if (isInstallTabId(value)) setActiveTab(value);
          }}
          class="mt-16"
        >
          <Tabs.List
            class="no-scrollbar flex gap-2 overflow-x-auto"
            aria-label="Installation platform"
          >
            {INSTALL_OPTIONS.map(option => (
              <Tabs.Trigger
                value={option.id}
                class="rounded-full px-4 py-2.5 text-xs font-medium whitespace-nowrap text-[var(--ink-muted)] hover:text-[var(--ink)] data-[selected]:bg-white/[0.09] data-[selected]:text-[var(--ink)]"
              >
                {option.label}
              </Tabs.Trigger>
            ))}
            <Tabs.Indicator class="hidden" />
          </Tabs.List>

          {INSTALL_OPTIONS.map(option => (
            <Tabs.Content value={option.id} class="mt-5">
              <figure class="m-0 flex min-h-44 flex-col justify-between gap-8 rounded-[1.75rem] border border-white/[0.1] bg-[#0b0f0c] p-6 shadow-[0_2rem_7rem_rgba(0,0,0,0.25)] sm:flex-row sm:items-center sm:p-9">
                <code class="block overflow-x-auto text-sm text-[var(--ink)] sm:text-base">
                  <span class="text-[var(--signal)]">$ </span>
                  {option.command}
                </code>
                <button
                  type="button"
                  class="manifest-button shrink-0 self-start sm:self-auto"
                  onClick={() => void copyCommand()}
                >
                  {copied() ? (
                    <Check size={16} strokeWidth={1.5} />
                  ) : (
                    <Copy size={16} strokeWidth={1.5} />
                  )}
                  {copied() ? 'Copied' : 'Copy'}
                </button>
              </figure>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>
    </section>
  );
};

export default Installation;
