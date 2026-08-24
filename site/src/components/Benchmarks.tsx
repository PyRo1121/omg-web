import type { Component } from 'solid-js';

const Benchmarks: Component = () => (
  <section id="benchmarks" class="manifest-shell py-28 sm:py-36" aria-labelledby="benchmark-title">
    <header class="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
      <h2
        id="benchmark-title"
        class="text-5xl leading-[0.94] font-medium tracking-[-0.055em] sm:text-7xl"
      >
        Fast enough to disappear.
      </h2>
      <p class="m-0 max-w-2xl text-lg leading-relaxed text-[var(--ink-muted)]">
        Measured on an Intel i9-14900K over ten iterations. Command latency, not simulated
        throughput.
      </p>
    </header>

    <p
      class="my-20 text-[clamp(6rem,22vw,18rem)] leading-[0.72] font-semibold tracking-[-0.095em] text-[var(--signal)]"
      aria-label="Twenty-two times faster"
    >
      22×
    </p>

    <div class="overflow-x-auto">
      <table class="w-full min-w-[42rem] border-collapse text-left">
        <caption class="sr-only">OMG command latency compared with pacman and apt-cache</caption>
        <thead class="font-mono text-[10px] text-[var(--ink-muted)]">
          <tr class="border-b border-[var(--rule-strong)]">
            <th scope="col" class="py-4 font-normal">
              Command
            </th>
            <th scope="col" class="py-4 font-normal">
              OMG
            </th>
            <th scope="col" class="py-4 font-normal">
              Reference
            </th>
            <th scope="col" class="py-4 text-right font-normal">
              Difference
            </th>
          </tr>
        </thead>
        <tbody class="font-mono text-sm">
          <tr class="border-b border-[var(--rule)]">
            <th scope="row" class="py-6 font-normal">
              pacman search
            </th>
            <td class="py-6 text-[var(--signal)]">6 ms</td>
            <td class="py-6 text-[var(--ink-muted)]">133 ms</td>
            <td class="py-6 text-right">22×</td>
          </tr>
          <tr class="border-b border-[var(--rule)]">
            <th scope="row" class="py-6 font-normal">
              pacman info
            </th>
            <td class="py-6 text-[var(--signal)]">6.5 ms</td>
            <td class="py-6 text-[var(--ink-muted)]">138 ms</td>
            <td class="py-6 text-right">21×</td>
          </tr>
          <tr class="border-b border-[var(--rule)]">
            <th scope="row" class="py-6 font-normal">
              apt-cache search
            </th>
            <td class="py-6 text-[var(--signal)]">11 ms</td>
            <td class="py-6 text-[var(--ink-muted)]">652 ms</td>
            <td class="py-6 text-right">59×</td>
          </tr>
          <tr>
            <th scope="row" class="py-6 font-normal">
              apt-cache explicit
            </th>
            <td class="py-6 text-[var(--signal)]">2 ms</td>
            <td class="py-6 text-[var(--ink-muted)]">601 ms</td>
            <td class="py-6 text-right">300×</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
);

export default Benchmarks;
