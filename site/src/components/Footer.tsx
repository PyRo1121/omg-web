import { ArrowDown } from 'lucide-solid';
import type { Component } from 'solid-js';

const Footer: Component = () => (
  <footer class="manifest-shell border-t border-[var(--rule)]">
    <section class="grid gap-10 py-24 sm:py-32 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <h2 class="max-w-[12ch] text-5xl leading-[0.9] font-semibold tracking-[-0.065em] sm:text-7xl">
          One command. Your whole machine.
        </h2>
        <p class="mt-7 max-w-lg text-lg leading-relaxed text-[var(--ink-muted)]">
          Free and open source under the MIT license. No account required.
        </p>
      </div>
      <a
        href="/#install"
        class="manifest-button manifest-button--primary group h-14 px-8 text-base"
      >
        Install OMG
        <ArrowDown
          class="h-4 w-4 transition-transform group-hover:translate-y-0.5"
          strokeWidth={1.5}
        />
      </a>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-6 border-t border-[var(--rule)] py-6">
      <p class="m-0 text-lg font-bold tracking-[-0.055em]">
        OMG<span class="text-[var(--signal)]">/</span>
      </p>
      <nav aria-label="Footer navigation">
        <ul class="m-0 flex list-none flex-wrap gap-x-7 gap-y-2 p-0 text-sm text-[var(--ink-muted)]">
          <li>
            <a href="/docs/" class="hover:text-[var(--ink)]">
              Docs
            </a>
          </li>
          <li>
            <a
              href="https://github.com/PyRo1121/omg"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-[var(--ink)]"
            >
              GitHub
            </a>
          </li>
          <li>
            <a href="/privacy" class="hover:text-[var(--ink)]">
              Privacy
            </a>
          </li>
          <li>
            <a href="/terms" class="hover:text-[var(--ink)]">
              Terms
            </a>
          </li>
        </ul>
      </nav>
    </div>
  </footer>
);

export default Footer;
