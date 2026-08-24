import type { Component } from 'solid-js';

const Benchmarks: Component = () => (
  <section
    id="benchmarks"
    class="manifest-shell manifest-section"
    aria-labelledby="benchmark-title"
  >
    <div class="manifest-grid">
      <header class="col-span-5 flex flex-col justify-between border-r border-[var(--ink)] p-6 sm:p-10">
        <span class="manifest-index">03 / BENCHMARK</span>
        <div class="mt-24">
          <h2
            id="benchmark-title"
            class="text-5xl leading-[0.9] font-black tracking-[-0.055em] uppercase sm:text-7xl"
          >
            Latency is a feature.
          </h2>
          <p class="mt-6 max-w-md text-[var(--ink-muted)]">
            Intel i9-14900K, ten iterations. Values show measured command latency, not simulated
            throughput.
          </p>
        </div>
      </header>

      <div class="col-span-7 overflow-x-auto bg-[var(--paper-raised)]">
        <table class="w-full min-w-[42rem] border-collapse text-left text-xs">
          <caption class="sr-only">
            OMG command latency compared with system package managers
          </caption>
          <thead>
            <tr class="border-b border-[var(--ink)]">
              <th scope="col" class="p-5 font-medium">
                Platform / command
              </th>
              <th scope="col" class="p-5 font-medium">
                OMG
              </th>
              <th scope="col" class="p-5 font-medium">
                Reference
              </th>
              <th scope="col" class="p-5 text-right font-medium">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-[var(--rule)] bg-[var(--paper-muted)]">
              <th colSpan={4} scope="colgroup" class="p-3 text-[10px] tracking-[0.1em] uppercase">
                Arch Linux / pacman
              </th>
            </tr>
            <tr class="border-b border-[var(--rule)]">
              <th scope="row" class="p-5 font-normal">
                search
              </th>
              <td class="p-5 font-semibold text-[var(--signal)]">6 ms</td>
              <td class="p-5">133 ms</td>
              <td class="p-5 text-right font-semibold">22×</td>
            </tr>
            <tr class="border-b border-[var(--rule)]">
              <th scope="row" class="p-5 font-normal">
                info
              </th>
              <td class="p-5 font-semibold text-[var(--signal)]">6.5 ms</td>
              <td class="p-5">138 ms</td>
              <td class="p-5 text-right font-semibold">21×</td>
            </tr>
            <tr class="border-b border-[var(--rule)]">
              <th scope="row" class="p-5 font-normal">
                explicit
              </th>
              <td class="p-5 font-semibold text-[var(--signal)]">1.2 ms</td>
              <td class="p-5">14 ms</td>
              <td class="p-5 text-right font-semibold">12×</td>
            </tr>
            <tr class="border-b border-[var(--rule)] bg-[var(--paper-muted)]">
              <th colSpan={4} scope="colgroup" class="p-3 text-[10px] tracking-[0.1em] uppercase">
                Debian / apt-cache
              </th>
            </tr>
            <tr class="border-b border-[var(--rule)]">
              <th scope="row" class="p-5 font-normal">
                search
              </th>
              <td class="p-5 font-semibold text-[var(--signal)]">11 ms</td>
              <td class="p-5">652 ms</td>
              <td class="p-5 text-right font-semibold">59×</td>
            </tr>
            <tr class="border-b border-[var(--rule)]">
              <th scope="row" class="p-5 font-normal">
                info
              </th>
              <td class="p-5 font-semibold text-[var(--signal)]">27 ms</td>
              <td class="p-5">462 ms</td>
              <td class="p-5 text-right font-semibold">17×</td>
            </tr>
            <tr>
              <th scope="row" class="p-5 font-normal">
                explicit
              </th>
              <td class="p-5 font-semibold text-[var(--signal)]">2 ms</td>
              <td class="p-5">601 ms</td>
              <td class="p-5 text-right font-semibold">300×</td>
            </tr>
          </tbody>
        </table>
        <div class="grid grid-cols-[1fr_auto] border-t border-[var(--ink)] p-5 font-mono text-xs">
          <span>Runtime version switch</span>
          <strong class="text-[var(--signal)]">OMG 1.8 ms / 83–111×</strong>
        </div>
      </div>
    </div>
  </section>
);

export default Benchmarks;
