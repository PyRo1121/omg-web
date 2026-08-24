import { ArrowDown, ArrowUpRight } from 'lucide-solid';
import type { Component } from 'solid-js';
import HeroTerminal from './hero/HeroTerminal';

const Hero: Component = () => (
  <section
    class="relative isolate min-h-[100dvh] overflow-hidden pt-28"
    aria-labelledby="hero-title"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none absolute top-[18%] left-[54%] -z-10 hidden -translate-x-1/2 text-[clamp(16rem,32vw,35rem)] leading-none font-black tracking-[-0.12em] text-white/[0.018] lg:block"
    >
      OMG
    </span>

    <div class="manifest-shell grid min-h-[calc(100dvh-7rem)] items-center gap-14 pb-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-20">
      <header class="max-w-3xl py-12 lg:py-20">
        <h1
          id="hero-title"
          class="text-[clamp(3.4rem,7.4vw,7.4rem)] leading-[0.88] font-semibold tracking-[-0.075em]"
        >
          One package manager.
          <br />
          <em class="font-normal text-[var(--signal)]">Every toolchain.</em>
        </h1>
        <p class="mt-8 max-w-[38rem] text-lg leading-relaxed text-[var(--ink-muted)] sm:text-xl">
          Install Linux packages, switch language runtimes, and reproduce a project environment
          without juggling seven different managers.
        </p>
        <p class="mt-9 flex flex-wrap gap-3">
          <a href="#install" class="manifest-button manifest-button--primary group">
            Install OMG
            <ArrowDown
              class="h-4 w-4 transition-transform group-hover:translate-y-0.5"
              strokeWidth={1.5}
            />
          </a>
          <a href="/docs/" class="manifest-button group">
            Read the docs
            <ArrowUpRight
              class="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={1.5}
            />
          </a>
        </p>

        <dl class="mt-14 grid max-w-2xl grid-cols-3 gap-5 border-t border-[var(--rule)] pt-5">
          <div>
            <dt class="text-xs text-[var(--ink-muted)]">Measured search</dt>
            <dd class="m-0 mt-2 font-mono text-2xl text-[var(--ink)]">22×</dd>
          </div>
          <div>
            <dt class="text-xs text-[var(--ink-muted)]">Runtime catalog</dt>
            <dd class="m-0 mt-2 font-mono text-2xl text-[var(--ink)]">100+</dd>
          </div>
          <div>
            <dt class="text-xs text-[var(--ink-muted)]">Core</dt>
            <dd class="m-0 mt-2 font-mono text-2xl text-[var(--ink)]">Rust</dd>
          </div>
        </dl>
      </header>

      <HeroTerminal />
    </div>
  </section>
);

export default Hero;
