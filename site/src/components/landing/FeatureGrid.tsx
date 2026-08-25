import type { Component } from 'solid-js';
import { For } from 'solid-js';

const WORKFLOWS = [
  {
    job: 'Install an app',
    before: 'Instead of learning apt, pacman, or brew',
    command: 'omg install ripgrep',
    result: 'Installed with your system’s own package manager',
  },
  {
    job: 'Install Node.js, Python, or Rust',
    before: 'Instead of configuring nvm, pyenv, or rustup',
    command: 'omg use node 22',
    result: 'Node 22 installed and ready to use',
  },
  {
    job: 'Set up a new machine',
    before: 'Instead of replaying setup notes from memory',
    command: 'omg env sync <share-url>',
    result: 'Every package and language reinstalled for you',
  },
] as const;

const COMMAND_SURFACE = [
  'omg search ripgrep',
  'omg install ripgrep',
  'omg update',
  'omg use node 22',
  'omg use python 3.12',
  'omg use rust stable',
  'omg env capture',
  'omg env check',
  'omg env sync <share-url>',
] as const;

const FeatureGrid: Component = () => (
  <section id="workflow" class="manifest-shell py-24 sm:py-32" aria-labelledby="workflow-title">
    <header class="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <h2
        id="workflow-title"
        class="max-w-[10ch] text-5xl leading-[0.9] font-semibold tracking-[-0.065em] sm:text-7xl"
      >
        One interface. Three jobs.
      </h2>
      <div class="max-w-xl lg:justify-self-end">
        <p class="m-0 text-lg leading-relaxed text-[var(--ink-muted)]">
          OMG uses the package managers you already trust under the hood. You just learn one command
          instead of seven.
        </p>
        <a
          href="/docs/"
          class="mt-5 inline-flex min-h-6 items-center py-1 text-sm font-medium text-[var(--signal)] underline decoration-[var(--rule)] underline-offset-4 hover:decoration-[var(--signal)]"
        >
          Read the full documentation
        </a>
      </div>
    </header>

    <ol class="mt-20 list-none p-0">
      <For each={WORKFLOWS}>
        {workflow => (
          <li class="grid gap-6 border-t border-[var(--rule)] py-9 lg:grid-cols-[0.8fr_0.75fr_1.25fr] lg:gap-12 lg:py-12">
            <h3 class="text-2xl font-medium tracking-[-0.04em] sm:text-3xl">{workflow.job}</h3>
            <p class="m-0 max-w-56 text-sm leading-relaxed text-[var(--ink-muted)]">
              {workflow.before}
            </p>
            <div>
              <code class="block bg-[var(--paper-raised)] px-4 py-3 text-sm break-all text-[var(--ink)]">
                {workflow.command}
              </code>
              <p class="mt-4 text-sm text-[var(--ink-muted)]">{workflow.result}</p>
            </div>
          </li>
        )}
      </For>
    </ol>

    <div class="mt-16 grid gap-10 border-t border-[var(--rule)] pt-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div>
        <h3 class="max-w-[12ch] text-2xl leading-tight font-semibold tracking-[-0.04em] sm:text-3xl">
          That is the whole interface.
        </h3>
        <p class="mt-4 max-w-sm leading-relaxed text-[var(--ink-muted)]">
          Search, install, pin, update, capture, restore — the same shape every time.
        </p>
        <a
          href="/docs/"
          class="mt-6 inline-flex min-h-6 items-center py-1 text-sm font-medium text-[var(--signal)] underline decoration-[var(--rule)] underline-offset-4 hover:decoration-[var(--signal)]"
        >
          Full command reference
        </a>
      </div>
      <ul class="m-0 grid list-none gap-x-10 gap-y-2 p-0 font-mono text-[13px] text-[var(--ink-muted)] sm:grid-cols-2">
        <For each={COMMAND_SURFACE}>{command => <li>{command}</li>}</For>
      </ul>
    </div>
  </section>
);

export default FeatureGrid;
