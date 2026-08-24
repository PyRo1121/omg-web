import type { Component } from 'solid-js';

const COMMANDS = [
  { prompt: '$', value: 'omg install bun' },
  { prompt: '01', value: 'resolve   bun / latest' },
  { prompt: '02', value: 'fetch     linux-x64' },
  { prompt: '03', value: 'link      ~/.local/bin/bun' },
  { prompt: '✓', value: 'installed  bun' },
] as const;

const HeroTerminal: Component = () => (
  <figure class="m-0 border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-raised)]">
    <figcaption class="manifest-label flex justify-between border-b border-[#4a4945] px-4 py-3 text-[#aaa59a]">
      <span>Local transaction</span>
      <span>OMG / 01</span>
    </figcaption>
    <div class="divide-y divide-[#3a3936] font-mono text-xs sm:text-sm">
      {COMMANDS.map((line, index) => (
        <div class="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-4">
          <span class={index === COMMANDS.length - 1 ? 'text-[#ff6a58]' : 'text-[#817d74]'}>
            {line.prompt}
          </span>
          <code class="text-[var(--paper-raised)]">{line.value}</code>
          <span class="hidden text-[10px] tracking-[0.08em] text-[#817d74] sm:block">
            {index === 0 ? 'INPUT' : index === COMMANDS.length - 1 ? 'DONE' : 'OK'}
          </span>
        </div>
      ))}
    </div>
    <div class="grid grid-cols-3 border-t border-[#4a4945] font-mono text-[10px] tracking-[0.08em] text-[#aaa59a] uppercase">
      <span class="border-r border-[#4a4945] px-4 py-3">No sudo</span>
      <span class="border-r border-[#4a4945] px-4 py-3">Atomic</span>
      <span class="px-4 py-3">Reproducible</span>
    </div>
  </figure>
);

export default HeroTerminal;
