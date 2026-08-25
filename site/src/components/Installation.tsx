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
  { id: 'arch', label: 'Arch / AUR', command: 'yay -S omg-bin' },
  { id: 'source', label: 'From source', command: 'cargo install omg --locked' },
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
      class="manifest-shell border-t border-[var(--rule)] py-24 sm:py-32"
      aria-labelledby="install-title"
    >
      <div class="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
        <header>
          <h2
            id="install-title"
            class="max-w-[8ch] text-5xl leading-[0.9] font-semibold tracking-[-0.065em] sm:text-7xl"
          >
            Install once. Start simplifying.
          </h2>
          <p class="mt-7 max-w-sm leading-relaxed text-[var(--ink-muted)]">
            Choose your platform. Inspect every installer before it runs.
          </p>
        </header>

        <Tabs.Root
          value={activeTab()}
          onChange={value => {
            if (isInstallTabId(value)) setActiveTab(value);
          }}
          class="flex min-w-0 flex-col bg-[var(--paper-raised)]"
        >
          <Tabs.List
            class="grid grid-cols-3 border-b border-[var(--rule)]"
            aria-label="Installation platform"
          >
            {INSTALL_OPTIONS.map(option => (
              <Tabs.Trigger
                value={option.id}
                class="min-h-14 min-w-0 border-r border-[var(--rule)] px-2 text-xs font-medium whitespace-nowrap text-[var(--ink-muted)] hover:text-[var(--ink)] data-[selected]:bg-[var(--signal)] data-[selected]:font-semibold data-[selected]:text-[var(--signal-ink)] sm:px-5 sm:text-sm"
              >
                {option.label}
              </Tabs.Trigger>
            ))}
            <Tabs.Indicator class="hidden" />
          </Tabs.List>

          {INSTALL_OPTIONS.map(option => (
            <Tabs.Content
              value={option.id}
              class="flex flex-1 flex-col justify-between p-5 sm:p-8 xl:p-12"
            >
              <div>
                <code class="block text-sm leading-relaxed text-[var(--ink)] sm:text-base">
                  <span class="text-[var(--signal)]">$ </span>
                  {option.command}
                </code>
              </div>
              <button
                type="button"
                class="manifest-button mt-16 self-start"
                onClick={() => void copyCommand()}
              >
                {copied() ? (
                  <Check size={16} strokeWidth={1.5} />
                ) : (
                  <Copy size={16} strokeWidth={1.5} />
                )}
                {copied() ? 'Copied' : 'Copy command'}
              </button>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>
    </section>
  );
};

export default Installation;
