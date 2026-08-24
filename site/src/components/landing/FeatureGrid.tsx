import type { Component } from 'solid-js';
import { For } from 'solid-js';

const WORKFLOWS = [
  {
    job: 'Install a package',
    before: 'apt · pacman · brew',
    command: 'omg install ripgrep',
    result: 'Native package, one command',
  },
  {
    job: 'Pin a runtime',
    before: 'nvm · pyenv · rustup',
    command: 'omg use node 22',
    result: 'Runtime installed and selected',
  },
  {
    job: 'Restore a toolchain',
    before: 'README · shell hooks · memory',
    command: 'omg env sync <share-url>',
    result: 'The shared environment restored',
  },
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
          OMG does not replace the package repositories you trust. It replaces the commands, version
          managers, and setup notes you have to remember.
        </p>
        <a
          href="/docs/"
          class="mt-5 inline-flex min-h-6 items-center py-1 font-mono text-[11px] text-[var(--signal)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
        >
          Read the technical details →
        </a>
      </div>
    </header>

    <ol class="mt-20 list-none p-0 sm:mt-24">
      <For each={WORKFLOWS}>
        {(workflow, index) => (
          <li class="grid gap-6 border-t border-[var(--rule)] py-9 lg:grid-cols-[0.8fr_0.75fr_1.25fr] lg:gap-12 lg:py-12">
            <div class="flex items-start gap-5">
              <span class="pt-1 font-mono text-[10px] text-[var(--signal)]">0{index() + 1}</span>
              <h3 class="text-2xl font-medium tracking-[-0.04em] sm:text-3xl">{workflow.job}</h3>
            </div>

            <div>
              <p class="m-0 font-mono text-[9px] tracking-[0.06em] text-[var(--ink-muted)]">
                BEFORE
              </p>
              <p class="mt-3 font-mono text-xs leading-relaxed text-[var(--ink-muted)]">
                {workflow.before}
              </p>
            </div>

            <div>
              <p class="m-0 font-mono text-[9px] tracking-[0.06em] text-[var(--signal)]">
                WITH OMG
              </p>
              <code class="mt-3 block bg-[var(--paper-raised)] px-4 py-3 text-sm text-[var(--ink)]">
                <span class="text-[var(--signal)]">$ </span>
                <span class="break-all">{workflow.command}</span>
              </code>
              <p class="mt-4 text-sm text-[var(--ink-muted)]">{workflow.result}</p>
            </div>
          </li>
        )}
      </For>
    </ol>
  </section>
);

export default FeatureGrid;
