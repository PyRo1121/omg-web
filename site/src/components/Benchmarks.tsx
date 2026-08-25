import type { Component } from 'solid-js';

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
          Real command latency, measured. Lower is better.
        </p>
      </div>
    </header>

    <div class="grid bg-[var(--paper-raised)]">
      <div class="grid grid-cols-[1fr_auto] items-end px-5 py-10 sm:px-8 lg:px-12">
        <span class="font-mono text-[10px] tracking-[0.06em] text-[var(--signal)]">
          PACMAN SEARCH
        </span>
        <p class="m-0 text-right">
          <strong class="block text-[clamp(5rem,12vw,10rem)] leading-[0.7] font-semibold tracking-[-0.09em] text-[var(--signal)]">
            22×
          </strong>
          <span class="mt-4 block text-sm text-[var(--ink-muted)]">faster search</span>
        </p>
      </div>

      <dl class="m-0">
        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-8 border-b border-[var(--rule)] px-5 py-6 font-mono text-xs sm:px-8 lg:px-12">
          <dt>Package search</dt>
          <dd class="m-0 text-[var(--signal)]">6 ms</dd>
          <dd class="m-0 w-24 text-right text-[var(--ink-muted)]">133 ms native</dd>
        </div>
        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-8 border-b border-[var(--rule)] px-5 py-6 font-mono text-xs sm:px-8 lg:px-12">
          <dt>Package info</dt>
          <dd class="m-0 text-[var(--signal)]">6.5 ms</dd>
          <dd class="m-0 w-24 text-right text-[var(--ink-muted)]">138 ms native</dd>
        </div>
        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-8 px-5 py-6 font-mono text-xs sm:px-8 lg:px-12">
          <dt>Explicit packages</dt>
          <dd class="m-0 text-[var(--signal)]">2 ms</dd>
          <dd class="m-0 w-24 text-right text-[var(--ink-muted)]">601 ms native</dd>
        </div>
      </dl>
    </div>
  </section>
);

export default Benchmarks;
