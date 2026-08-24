import { ArrowDown, ArrowRight } from 'lucide-solid';
import type { Component } from 'solid-js';

const REPLACED_MANAGERS = ['pacman', 'yay', 'nvm', 'pyenv', 'rustup', 'rbenv', 'jenv'] as const;

const Hero: Component = () => (
  <section class="manifest-shell" aria-labelledby="hero-title">
    <div>
      <p class="m-0 flex flex-wrap justify-between gap-3 py-5 font-mono text-[10px] tracking-[0.05em] text-[var(--ink-muted)]">
        <span>PACKAGE OPERATIONS / RUNTIME CONTROL / ENVIRONMENT STATE</span>
        <span>OPEN SOURCE · BUILT IN RUST</span>
      </p>

      <div class="grid gap-8 border-t border-[var(--rule)] pt-8 lg:grid-cols-[1fr_22rem] lg:gap-0 lg:pt-0">
        <header class="editorial-reveal flex min-h-[32rem] flex-col justify-end py-14 sm:min-h-[36rem] sm:py-20 lg:min-h-[43rem] lg:py-20 lg:pr-16">
          <h1
            id="hero-title"
            class="max-w-[14ch] text-[clamp(3.1rem,6.4vw,6.4rem)] leading-[0.86] font-semibold tracking-[-0.08em]"
          >
            Stop managing package managers.
          </h1>
          <div class="mt-10 grid max-w-4xl gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
            <p class="m-0 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)]">
              System packages, language runtimes, and project toolchains through one Rust CLI.
            </p>
            <p class="m-0 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a href="#install" class="manifest-button manifest-button--primary group">
                Install OMG
                <ArrowDown
                  class="h-4 w-4 transition-transform group-hover:translate-y-0.5"
                  strokeWidth={1.5}
                />
              </a>
              <a
                href="#workflow"
                class="group inline-flex min-h-6 items-center gap-2 py-1 text-sm font-medium text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
              >
                See the workflow
                <ArrowRight
                  class="h-4 w-4 transition-transform group-hover:translate-x-1"
                  strokeWidth={1.5}
                />
              </a>
            </p>
          </div>
        </header>

        <aside class="editorial-reveal editorial-reveal--late flex min-h-80 flex-col justify-between bg-[var(--signal)] p-6 text-[var(--signal-ink)] sm:p-8 lg:min-h-full">
          <p class="m-0 font-mono text-[10px] tracking-[0.06em]">COMMAND SURFACES</p>
          <p class="m-0 text-[clamp(6.5rem,13vw,8.25rem)] leading-[0.72] font-semibold tracking-[-0.1em] whitespace-nowrap">
            7<span class="font-normal">→</span>1
          </p>
          <p class="m-0 max-w-48 text-xl leading-tight font-semibold tracking-[-0.035em]">
            Keep the repositories. Lose the syntax switching.
          </p>
        </aside>
      </div>

      <figure class="m-0 flex flex-col gap-5 border-t border-[var(--rule)] py-6 sm:flex-row sm:items-center sm:justify-between">
        <figcaption class="font-mono text-[10px] tracking-[0.05em] text-[var(--ink-muted)]">
          One interface across your existing ecosystems
        </figcaption>
        <ul class="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
          {REPLACED_MANAGERS.map(manager => (
            <li class="font-mono text-[11px] text-[var(--ink-muted)]">{manager}</li>
          ))}
        </ul>
        <p class="m-0 font-mono text-[11px] font-semibold text-[var(--signal)]">OMG / READY</p>
      </figure>
    </div>
  </section>
);

export default Hero;
