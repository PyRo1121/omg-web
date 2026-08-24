import { Boxes, GitCompareArrows, Gauge, PackageSearch } from 'lucide-solid';
import type { Component } from 'solid-js';
import { For } from 'solid-js';

const FEATURES = [
  {
    code: 'PKG-01',
    title: 'One resolver',
    description: 'Query system packages and language ecosystems without memorizing seven CLIs.',
    icon: PackageSearch,
  },
  {
    code: 'ENV-02',
    title: 'Isolated installs',
    description: 'Keep project environments reproducible and separate from the system toolchain.',
    icon: Boxes,
  },
  {
    code: 'RUN-03',
    title: 'Native speed',
    description: 'Resolve and switch without shell shims, startup hooks, or background daemons.',
    icon: Gauge,
  },
  {
    code: 'OPS-04',
    title: 'Drift control',
    description:
      'Compare declared and installed state before configuration diverges across a team.',
    icon: GitCompareArrows,
  },
] as const;

const FeatureGrid: Component = () => (
  <section id="features" class="manifest-shell manifest-section" aria-labelledby="system-title">
    <div class="manifest-grid">
      <header class="col-span-4 flex min-h-80 flex-col justify-between border-r border-[var(--ink)] p-6 sm:p-10">
        <span class="manifest-index">01 / SYSTEM</span>
        <div>
          <h2
            id="system-title"
            class="text-5xl leading-[0.92] font-black tracking-[-0.055em] uppercase"
          >
            Fewer tools.
            <br />
            Less drift.
          </h2>
          <p class="mt-6 max-w-sm text-[var(--ink-muted)]">
            OMG treats package and runtime management as one operational system.
          </p>
        </div>
      </header>

      <ol class="col-span-8 m-0 list-none p-0">
        <For each={FEATURES}>
          {feature => (
            <li class="group grid min-h-36 grid-cols-[5rem_1fr_auto] items-center border-b border-[var(--rule)] px-6 last:border-b-0 sm:px-10">
              <span class="font-mono text-xs text-[var(--signal)]">{feature.code}</span>
              <div class="py-6">
                <h3 class="text-2xl font-bold tracking-[-0.035em]">{feature.title}</h3>
                <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">
                  {feature.description}
                </p>
              </div>
              <feature.icon
                size={28}
                strokeWidth={1.35}
                aria-hidden="true"
                class="ml-4 transition-transform group-hover:translate-x-1"
              />
            </li>
          )}
        </For>
      </ol>
    </div>
  </section>
);

export default FeatureGrid;
