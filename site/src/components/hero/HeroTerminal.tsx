import type { Component } from 'solid-js';

const COMMANDS = [
  { prompt: '$', value: 'omg install bun', state: 'input' },
  { prompt: '01', value: 'resolve   bun / latest', state: '8 ms' },
  { prompt: '02', value: 'fetch     linux-x64', state: '214 ms' },
  { prompt: '03', value: 'link      ~/.local/bin/bun', state: '4 ms' },
  { prompt: '✓', value: 'installed  bun', state: 'ready' },
] as const;

const HeroTerminal: Component = () => (
  <figure class="relative m-0 rotate-[1.5deg] overflow-hidden rounded-[1.75rem] border border-white/[0.12] bg-[#0b0f0c] shadow-[0_3rem_8rem_rgba(0,0,0,0.44)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:rotate-0 max-lg:rotate-0">
    <figcaption class="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4 font-mono text-[10px] tracking-[0.08em] text-[var(--ink-muted)]">
      <span class="h-2 w-2 rounded-full bg-[var(--signal)]" aria-hidden="true" />
      local transaction
      <span class="ml-auto">~/project</span>
    </figcaption>
    <ol class="m-0 list-none space-y-1 px-5 py-7 font-mono text-xs sm:px-7 sm:py-9 sm:text-sm">
      {COMMANDS.map((line, index) => (
        <li class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-2">
          <span class={index === COMMANDS.length - 1 ? 'text-[var(--signal)]' : 'text-[#667067]'}>
            {line.prompt}
          </span>
          <code class={index === 0 ? 'text-[var(--ink)]' : 'text-[#b7c0b8]'}>{line.value}</code>
          <span class="hidden text-[10px] text-[#667067] sm:block">{line.state}</span>
        </li>
      ))}
    </ol>
    <p class="m-0 flex items-center justify-between border-t border-white/[0.08] px-5 py-4 font-mono text-[10px] text-[var(--ink-muted)] sm:px-7">
      <span>atomic · no sudo · reproducible</span>
      <span class="text-[var(--signal)]">exit 0</span>
    </p>
  </figure>
);

export default HeroTerminal;
