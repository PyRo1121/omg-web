import type { Component } from 'solid-js';
import { For } from 'solid-js';

const BENCHMARKS = [
  { name: 'Package search', omg: '6 ms', native: '133 ms' },
  { name: 'Package info', omg: '6.5 ms', native: '138 ms' },
  { name: 'Explicit packages', omg: '2 ms', native: '601 ms' },
] as const;

const Benchmarks: Component = () => (
  <section
    id="benchmarks"
    class="manifest-shell grid gap-12 border-t border-[var(--rule)] py-24 sm:py-32 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16"
    aria-labelledby="benchmark-title"
  >
    <header class="flex flex-col justify-between">
      <div>
        <h2
          id="benchmark-title"
          class="max-w-[9ch] text-5xl leading-[0.9] font-semibold tracking-[-0.065em] sm:text-7xl"
        >
          Speed you do not wait for.
        </h2>
        <p class="mt-7 max-w-sm leading-relaxed text-[var(--ink-muted)]">
          Real command latency, measured on an Intel i9-14900K. Lower is better.
        </p>
      </div>
    </header>

    <div class="grid self-start bg-[var(--paper-raised)]">
      <div class="grid grid-cols-[1fr_auto] items-end px-6 pt-10 pb-8 sm:px-10">
        <p class="m-0 text-lg font-medium text-[var(--ink)]">Package search</p>
        <p class="m-0 text-right">
          <strong class="block text-[clamp(4.5rem,10vw,8rem)] leading-[0.75] font-semibold tracking-[-0.08em] text-[var(--signal)]">
            22×
          </strong>
          <span class="mt-3 block text-sm text-[var(--ink-muted)]">faster than pacman</span>
        </p>
      </div>

      <dl class="m-0 px-6 pb-8 sm:px-10">
        <For each={BENCHMARKS}>
          {benchmark => (
            <div class="flex items-baseline justify-between gap-6 border-t border-[var(--rule)] py-4">
              <dt class="text-sm text-[var(--ink-muted)]">{benchmark.name}</dt>
              <dd class="m-0 font-mono text-sm text-[var(--ink)]">
                {benchmark.omg}
                <span class="ml-3 text-[var(--ink-muted)]">vs {benchmark.native}</span>
              </dd>
            </div>
          )}
        </For>
      </dl>
    </div>
  </section>
);

export default Benchmarks;
