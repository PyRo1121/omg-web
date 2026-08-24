import type { Component } from 'solid-js';
import { For } from 'solid-js';

const FEATURES = [
  {
    title: 'Search once',
    description:
      'Find system packages and language tools without remembering which registry owns them.',
  },
  {
    title: 'Install without drift',
    description: 'Keep project toolchains isolated, declared, and repeatable across every machine.',
  },
  {
    title: 'Stay out of the shell',
    description:
      'Switch versions without startup hooks, shim forests, or a resident background process.',
  },
  {
    title: 'See the transaction',
    description: 'Preview the operation before OMG changes package or runtime state.',
  },
] as const;

const FeatureGrid: Component = () => (
  <section id="features" class="manifest-shell py-28 sm:py-36" aria-labelledby="system-title">
    <header class="max-w-3xl">
      <h2
        id="system-title"
        class="text-5xl leading-[0.95] font-medium tracking-[-0.055em] sm:text-7xl"
      >
        Seven package managers is not a workflow.
      </h2>
      <p class="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--ink-muted)]">
        OMG gives the whole machine one predictable interface without hiding what changes
        underneath.
      </p>
    </header>

    <figure class="mt-20 grid gap-10 border-y border-[var(--rule-strong)] py-10 lg:grid-cols-2 lg:gap-20">
      <figcaption class="sr-only">
        Package management workflow before and after adopting OMG
      </figcaption>
      <section>
        <h3 class="text-sm font-medium text-[var(--ink-muted)]">The usual setup</h3>
        <p class="mt-6 font-mono text-sm leading-8 text-[#657067] line-through decoration-white/20">
          apt install · nvm use · pyenv local · rustup override · mise activate · remember what
          changed
        </p>
      </section>
      <section>
        <h3 class="text-sm font-medium text-[var(--signal)]">The OMG setup</h3>
        <p class="mt-6 font-mono text-sm leading-8 text-[var(--ink)]">
          omg install · omg runtime use · omg env apply
        </p>
      </section>
    </figure>

    <ol class="m-0 mt-12 list-none border-t border-[var(--rule-strong)] p-0">
      <For each={FEATURES}>
        {feature => (
          <li class="grid gap-4 border-b border-[var(--rule)] py-8 sm:grid-cols-[0.8fr_1.2fr] sm:items-baseline sm:py-10">
            <h3 class="text-2xl font-medium tracking-[-0.035em] sm:text-3xl">{feature.title}</h3>
            <p class="m-0 max-w-xl leading-relaxed text-[var(--ink-muted)]">
              {feature.description}
            </p>
          </li>
        )}
      </For>
    </ol>
  </section>
);

export default FeatureGrid;
