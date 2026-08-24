import type { Component } from 'solid-js';
import HeroTerminal from './hero/HeroTerminal';

const Hero: Component = () => (
  <section class="manifest-shell border-b border-[var(--ink)]" aria-labelledby="hero-title">
    <div class="manifest-grid min-h-[calc(100dvh-4.5rem)]">
      <div class="col-span-7 flex flex-col justify-between border-r border-[var(--ink)] p-6 sm:p-10 lg:p-14">
        <div class="manifest-label flex items-center justify-between">
          <span class="text-[var(--signal)]">Package operations / Linux</span>
          <span>REV. 01</span>
        </div>

        <div class="py-16 lg:py-10">
          <h1
            id="hero-title"
            class="max-w-5xl text-[clamp(3.7rem,8.6vw,8.6rem)] leading-[0.82] font-black tracking-[-0.075em] uppercase"
          >
            One command.
            <br />
            Every package.
          </h1>
          <p class="mt-8 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)] sm:text-xl">
            Install system packages and language runtimes through one fast, reproducible Rust CLI.
          </p>
          <div class="mt-9 flex flex-wrap gap-3">
            <a href="#install" class="manifest-button manifest-button--primary">
              Install OMG
            </a>
            <a href="/docs/" class="manifest-button">
              Read the manual
            </a>
          </div>
        </div>

        <div class="grid grid-cols-3 border-t border-[var(--rule)] pt-4 font-mono text-[10px] tracking-[0.08em] uppercase sm:text-xs">
          <span>Arch / Debian / Ubuntu</span>
          <span class="text-center">Pure Rust</span>
          <span class="text-right">No sudo required</span>
        </div>
      </div>

      <div class="col-span-5 grid grid-rows-[auto_1fr_auto] bg-[var(--paper-raised)]">
        <div class="grid grid-cols-2 border-b border-[var(--ink)] font-mono text-xs">
          <div class="border-r border-[var(--rule)] p-5">
            <span class="manifest-label block text-[var(--ink-muted)]">Measured peak</span>
            <strong class="mt-2 block text-5xl font-semibold tracking-[-0.06em]">22×</strong>
          </div>
          <div class="p-5">
            <span class="manifest-label block text-[var(--ink-muted)]">Runtime catalog</span>
            <strong class="mt-2 block text-5xl font-semibold tracking-[-0.06em]">100+</strong>
          </div>
        </div>
        <div class="flex items-center p-6 sm:p-10">
          <HeroTerminal />
        </div>
        <div class="manifest-label flex justify-between border-t border-[var(--ink)] p-5 text-[var(--ink-muted)]">
          <span>Transaction preview</span>
          <span class="text-[var(--signal)]">Ready</span>
        </div>
      </div>
    </div>
  </section>
);

export default Hero;
