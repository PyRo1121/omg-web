import { ArrowDown, ArrowRight } from 'lucide-solid';
import type { Component } from 'solid-js';

const REPLACED_MANAGERS = ['pacman', 'yay', 'nvm', 'pyenv', 'rustup', 'rbenv', 'jenv'] as const;

const Hero: Component = () => (
  <section class="manifest-shell" aria-labelledby="hero-title">
    <div class="grid gap-10 pt-10 sm:pt-16 lg:grid-cols-[1fr_24rem] lg:gap-0 lg:pt-20">
      <header class="editorial-reveal flex flex-col justify-end pb-14 sm:pb-20 lg:pr-20">
        <h1
          id="hero-title"
          class="max-w-[13ch] text-[clamp(3.4rem,7.2vw,7.5rem)] leading-[0.85] font-semibold tracking-[-0.08em]"
        >
          Stop managing package managers.
        </h1>
        <p class="mt-8 max-w-lg text-xl leading-relaxed text-[var(--ink-muted)]">
          System packages, language runtimes, and project toolchains through one command.
        </p>
        <div class="mt-10 flex flex-wrap items-center gap-5">
          <a
            href="#install"
            class="manifest-button manifest-button--primary group h-14 px-8 text-base"
          >
            Install OMG — free
            <ArrowDown
              class="h-4 w-4 transition-transform group-hover:translate-y-0.5"
              strokeWidth={1.5}
            />
          </a>
          <a
            href="#workflow"
            class="group inline-flex min-h-6 items-center gap-2 py-1 text-sm font-medium text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
          >
            See how it works
            <ArrowRight
              class="h-4 w-4 transition-transform group-hover:translate-x-1"
              strokeWidth={1.5}
            />
          </a>
        </div>
      </header>

      <aside class="editorial-reveal editorial-reveal--late flex min-h-80 flex-col justify-between bg-[var(--signal)] p-6 text-[var(--signal-ink)] sm:p-8 lg:min-h-full">
        <p class="m-0 max-w-52 text-xl leading-tight font-semibold tracking-[-0.035em]">
          Seven tools you won’t open again.
        </p>
        <p class="m-0 text-[clamp(6.5rem,13vw,9rem)] leading-[0.72] font-semibold tracking-[-0.1em] whitespace-nowrap">
          7<span class="font-normal">→</span>1
        </p>
      </aside>
    </div>

    <ul class="m-0 flex list-none flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule)] p-0 py-5">
      {REPLACED_MANAGERS.map(manager => (
        <li class="font-mono text-[11px] text-[var(--ink-muted)]">{manager}</li>
      ))}
      <li class="ml-auto font-mono text-[11px] text-[var(--ink)]">→ one: omg</li>
    </ul>
  </section>
);

export default Hero;
