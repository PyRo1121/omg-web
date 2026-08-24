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
  <section
    id="workflow"
    class="manifest-shell border-x border-[var(--rule)]"
    aria-labelledby="workflow-title"
  >
    <header class="grid gap-8 border-b border-[var(--rule-strong)] px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-12 lg:py-32">
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

    <div
      class="hidden grid-cols-[0.95fr_0.8fr_1fr_1.05fr] border-b border-[var(--rule)] font-mono text-[10px] tracking-[0.05em] text-[var(--ink-muted)] lg:grid"
      aria-hidden="true"
    >
      <span class="px-8 py-4 lg:px-12">Job</span>
      <span class="border-l border-[var(--rule)] px-6 py-4">Before</span>
      <span class="border-l border-[var(--rule)] px-6 py-4">With OMG</span>
      <span class="border-l border-[var(--rule)] px-6 py-4">Result</span>
    </div>

    <ol class="m-0 list-none p-0">
      <For each={WORKFLOWS}>
        {(workflow, index) => (
          <li class="grid border-b border-[var(--rule)] last:border-b-0 lg:grid-cols-[0.95fr_0.8fr_1fr_1.05fr]">
            <h3 class="px-5 py-7 text-xl font-medium tracking-[-0.035em] sm:px-8 lg:px-12 lg:py-8">
              <span class="mr-4 font-mono text-[10px] text-[var(--signal)]">0{index() + 1}</span>
              {workflow.job}
            </h3>
            <p class="m-0 border-t border-[var(--rule)] px-5 py-5 font-mono text-xs text-[var(--ink-muted)] sm:px-8 lg:border-t-0 lg:border-l lg:px-6 lg:py-8">
              <span class="mb-2 block text-[9px] tracking-[0.05em] text-[var(--ink-muted)] lg:hidden">
                BEFORE
              </span>
              {workflow.before}
            </p>
            <p class="m-0 border-t border-[var(--rule)] bg-[var(--paper-raised)] px-5 py-5 font-mono text-xs text-[var(--ink)] sm:px-8 lg:border-t-0 lg:border-l lg:px-6 lg:py-8">
              <span class="mb-2 block text-[9px] tracking-[0.05em] text-[var(--signal)] lg:hidden">
                WITH OMG
              </span>
              <span class="text-[var(--signal)]">$ </span>
              <span class="break-all">{workflow.command}</span>
            </p>
            <p class="m-0 border-t border-[var(--rule)] px-5 py-5 text-sm text-[var(--ink-muted)] sm:px-8 lg:border-t-0 lg:border-l lg:px-6 lg:py-8">
              <span class="mb-2 block font-mono text-[9px] tracking-[0.05em] lg:hidden">
                RESULT
              </span>
              {workflow.result}
            </p>
          </li>
        )}
      </For>
    </ol>
  </section>
);

export default FeatureGrid;
