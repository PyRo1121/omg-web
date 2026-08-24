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
    if (resetTimer !== undefined) {
      window.clearTimeout(resetTimer);
    }
    resetTimer = window.setTimeout(() => setCopied(false), 1800);
  };

  onCleanup(() => {
    if (resetTimer !== undefined) {
      window.clearTimeout(resetTimer);
    }
  });

  return (
    <section id="install" class="manifest-shell manifest-section" aria-labelledby="install-title">
      <div class="manifest-grid">
        <header class="col-span-5 flex flex-col justify-between border-r border-[var(--ink)] bg-[var(--signal)] p-6 text-[var(--paper-raised)] sm:p-10">
          <span class="manifest-label">04 / INSTALL</span>
          <div class="mt-28">
            <h2
              id="install-title"
              class="text-6xl leading-[0.88] font-black tracking-[-0.065em] uppercase sm:text-8xl"
            >
              Ready in one command.
            </h2>
            <p class="mt-6 max-w-sm text-[#fae0dc]">
              Select a platform, inspect the command, then install without a privileged system-wide
              bootstrapper.
            </p>
          </div>
        </header>

        <div class="col-span-7 bg-[var(--paper-raised)] p-6 sm:p-10">
          <Tabs.Root
            value={activeTab()}
            onChange={value => {
              if (isInstallTabId(value)) {
                setActiveTab(value);
              }
            }}
            class="grid min-h-full lg:grid-cols-[13rem_1fr]"
          >
            <Tabs.List
              class="border border-[var(--ink)] lg:border-r-0"
              aria-label="Installation platform"
            >
              {INSTALL_OPTIONS.map(option => (
                <Tabs.Trigger
                  value={option.id}
                  class="manifest-label block w-full border-b border-[var(--rule)] px-4 py-5 text-left last:border-b-0 hover:bg-[var(--paper-muted)] data-[selected]:bg-[var(--ink)] data-[selected]:text-[var(--paper)]"
                >
                  {option.label}
                </Tabs.Trigger>
              ))}
              <Tabs.Indicator class="hidden" />
            </Tabs.List>

            <div class="border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-raised)]">
              {INSTALL_OPTIONS.map(option => (
                <Tabs.Content
                  value={option.id}
                  class="flex min-h-80 flex-col justify-between p-6 sm:p-8"
                >
                  <div class="manifest-label flex justify-between text-[#aaa59a]">
                    <span>Shell input</span>
                    <span>{option.id.toUpperCase()}</span>
                  </div>
                  <code class="my-12 block overflow-x-auto text-sm leading-7 text-[var(--paper-raised)] sm:text-base">
                    <span class="text-[#ff6a58]">$ </span>
                    {option.command}
                  </code>
                  <button
                    type="button"
                    class="manifest-button self-start border-[#aaa59a] text-[var(--paper-raised)] hover:border-[var(--paper-raised)] hover:bg-[var(--paper-raised)] hover:text-[var(--ink)]"
                    onClick={() => void copyCommand()}
                  >
                    {copied() ? (
                      <Check size={16} strokeWidth={1.6} />
                    ) : (
                      <Copy size={16} strokeWidth={1.6} />
                    )}
                    {copied() ? 'Copied' : 'Copy command'}
                  </button>
                </Tabs.Content>
              ))}
            </div>
          </Tabs.Root>
        </div>
      </div>
    </section>
  );
};

export default Installation;
