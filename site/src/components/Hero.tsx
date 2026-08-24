import { ArrowDown, ArrowRight } from 'lucide-solid';
import type { Component } from 'solid-js';

const INPUTS = ['System packages', 'Language runtimes', 'Project toolchains'] as const;

const Hero: Component = () => (
  <section class="manifest-shell" aria-labelledby="hero-title">
    <div class="grid min-h-[calc(100dvh-4.5rem)] grid-rows-[1fr_auto] border-x border-[var(--rule)]">
      <div class="grid items-end gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.45fr_0.55fr] lg:gap-20 lg:px-12 lg:py-24">
        <header class="editorial-reveal max-w-5xl">
          <h1
            id="hero-title"
            class="max-w-[17ch] text-[clamp(3.1rem,7.1vw,7rem)] leading-[0.86] font-semibold tracking-[-0.08em]"
          >
            Stop managing package managers.
          </h1>
        </header>

        <aside class="editorial-reveal editorial-reveal--late border-t border-[var(--rule-strong)] pt-6 lg:mb-2">
          <p class="m-0 max-w-sm text-lg leading-relaxed text-[var(--ink-muted)]">
            System packages, language runtimes, and project toolchains through one Rust CLI.
          </p>
          <p class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href="#install" class="manifest-button manifest-button--primary group">
              Install OMG
              <ArrowDown
                class="h-4 w-4 transition-transform group-hover:translate-y-0.5"
                strokeWidth={1.5}
              />
            </a>
            <a
              href="#workflow"
              class="group inline-flex items-center gap-2 text-sm font-medium text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
            >
              See the workflow
              <ArrowRight
                class="h-4 w-4 transition-transform group-hover:translate-x-1"
                strokeWidth={1.5}
              />
            </a>
          </p>
        </aside>
      </div>

      <figure class="m-0 border-t border-[var(--rule-strong)]">
        <figcaption class="sr-only">
          OMG combines system packages, language runtimes, and project toolchains into one declared
          environment.
        </figcaption>
        <div class="grid lg:grid-cols-[1fr_5.5rem_1fr]">
          <ul class="m-0 grid list-none sm:grid-cols-3 lg:grid-cols-1">
            {INPUTS.map((input, index) => (
              <li class="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4 font-mono text-[11px] text-[var(--ink-muted)] last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0 lg:border-r-0 lg:border-b lg:last:border-b-0">
                <span>{input}</span>
                <span aria-hidden="true">0{index + 1}</span>
              </li>
            ))}
          </ul>

          <div class="grid min-h-24 place-items-center bg-[var(--signal)] text-[var(--signal-ink)] lg:min-h-full">
            <span class="text-2xl font-bold tracking-[-0.08em]">O/</span>
          </div>

          <div class="flex min-h-40 flex-col justify-between bg-[var(--paper-raised)] p-5 sm:p-7 lg:min-h-full">
            <span class="font-mono text-[10px] tracking-[0.06em] text-[var(--signal)]">
              ONE STATE MODEL
            </span>
            <p class="m-0 max-w-lg text-2xl leading-tight font-medium tracking-[-0.04em] sm:text-3xl">
              Search once. Declare versions. Rebuild the same environment anywhere.
            </p>
          </div>
        </div>
      </figure>
    </div>
  </section>
);

export default Hero;
