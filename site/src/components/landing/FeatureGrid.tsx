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
          class="mt-7 inline-block font-mono text-[11px] text-[var(--signal)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
        >
          Read the technical details →
        </a>
      </div>
    </header>

    <div class="overflow-x-auto">
      <table class="w-full min-w-[52rem] border-collapse text-left">
        <caption class="sr-only">Common package-management workflows before and after OMG</caption>
        <thead class="font-mono text-[10px] tracking-[0.05em] text-[var(--ink-muted)]">
          <tr class="border-b border-[var(--rule)]">
            <th scope="col" class="px-5 py-4 font-normal sm:px-8 lg:px-12">
              Job
            </th>
            <th scope="col" class="border-l border-[var(--rule)] px-6 py-4 font-normal">
              Before
            </th>
            <th scope="col" class="border-l border-[var(--rule)] px-6 py-4 font-normal">
              With OMG
            </th>
            <th scope="col" class="border-l border-[var(--rule)] px-6 py-4 font-normal">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={WORKFLOWS}>
            {(workflow, index) => (
              <tr class="border-b border-[var(--rule)] last:border-b-0">
                <th
                  scope="row"
                  class="px-5 py-8 text-xl font-medium tracking-[-0.035em] sm:px-8 lg:px-12"
                >
                  <span class="mr-5 font-mono text-[10px] text-[var(--signal)]">
                    0{index() + 1}
                  </span>
                  {workflow.job}
                </th>
                <td class="border-l border-[var(--rule)] px-6 py-8 font-mono text-xs text-[var(--ink-muted)]">
                  {workflow.before}
                </td>
                <td class="border-l border-[var(--rule)] bg-[var(--paper-raised)] px-6 py-8 font-mono text-xs text-[var(--ink)]">
                  <span class="text-[var(--signal)]">$ </span>
                  {workflow.command}
                </td>
                <td class="border-l border-[var(--rule)] px-6 py-8 text-sm text-[var(--ink-muted)]">
                  {workflow.result}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  </section>
);

export default FeatureGrid;
