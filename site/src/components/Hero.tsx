import { ArrowDown, ArrowRight } from 'lucide-solid';
import type { Component } from 'solid-js';

const REPLACED_MANAGERS = ['pacman', 'yay', 'nvm', 'pyenv', 'rustup', 'rbenv', 'jenv'] as const;

const Hero: Component = () => (
  <section class="manifest-shell" aria-labelledby="hero-title">
    <div class="border-x border-[var(--rule)]">
      <p class="m-0 flex flex-wrap justify-between gap-3 border-b border-[var(--rule)] px-5 py-3 font-mono text-[10px] tracking-[0.05em] text-[var(--ink-muted)] sm:px-8 lg:px-12">
        <span>PACKAGE OPERATIONS / RUNTIME CONTROL / ENVIRONMENT STATE</span>
        <span>OPEN SOURCE · BUILT IN RUST</span>
      </p>

      <div class="grid lg:grid-cols-[1fr_20rem]">
        <header class="editorial-reveal flex min-h-[38rem] flex-col justify-end px-5 py-16 sm:px-8 sm:py-20 lg:min-h-[45rem] lg:px-12 lg:py-20">
          <h1
            id="hero-title"
            class="max-w-[14ch] text-[clamp(3.1rem,6.4vw,6.4rem)] leading-[0.86] font-semibold tracking-[-0.08em]"
          >
            Stop managing package managers.
          </h1>
          <div class="mt-10 grid gap-8 border-t border-[var(--rule-strong)] pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
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
                class="group inline-flex items-center gap-2 text-sm font-medium text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
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

        <aside class="editorial-reveal editorial-reveal--late flex min-h-72 flex-col justify-between bg-[var(--signal)] p-5 text-[var(--signal-ink)] sm:p-8 lg:min-h-full">
          <p class="m-0 font-mono text-[10px] tracking-[0.06em]">COMMAND SURFACES</p>
          <p class="m-0 text-[clamp(7rem,18vw,13rem)] leading-[0.7] font-semibold tracking-[-0.11em] lg:text-[10rem]">
            7<span class="font-normal">→</span>1
          </p>
          <p class="m-0 max-w-48 text-xl leading-tight font-semibold tracking-[-0.035em]">
            Keep the repositories. Lose the syntax switching.
          </p>
        </aside>
      </div>

      <figure class="m-0 grid border-t border-[var(--rule-strong)] lg:grid-cols-[1fr_auto]">
        <figcaption class="sr-only">
          OMG replaces seven package and runtime manager command surfaces with one interface.
        </figcaption>
        <ul class="m-0 grid list-none grid-cols-2 p-0 sm:grid-cols-4 lg:grid-cols-7">
          {REPLACED_MANAGERS.map(manager => (
            <li class="border-r border-b border-[var(--rule)] px-5 py-4 font-mono text-[11px] text-[var(--ink-muted)] line-through decoration-[var(--rule-strong)] last:border-r-0 lg:border-b-0">
              {manager}
            </li>
          ))}
        </ul>
        <p class="m-0 flex min-h-14 min-w-52 items-center justify-between bg-[var(--paper-raised)] px-5 font-mono text-[11px] text-[var(--signal)] sm:px-8">
          <span>omg</span>
          <span aria-hidden="true">READY</span>
        </p>
      </figure>
    </div>
  </section>
);

export default Hero;
