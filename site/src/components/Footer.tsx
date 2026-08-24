import { ArrowDown } from 'lucide-solid';
import type { Component } from 'solid-js';

const Footer: Component = () => (
  <footer class="manifest-shell border-x border-t border-[var(--rule)]">
    <section class="grid gap-10 border-b border-[var(--rule-strong)] px-5 py-20 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-12 lg:py-28">
      <div>
        <h2 class="max-w-[13ch] text-5xl leading-[0.9] font-semibold tracking-[-0.065em] sm:text-7xl">
          One command surface for the whole machine.
        </h2>
        <p class="mt-7 max-w-lg leading-relaxed text-[var(--ink-muted)]">
          Install the core for free. Learn the rest when you need it.
        </p>
      </div>
      <a href="/#install" class="manifest-button manifest-button--primary group lg:mb-1">
        Install OMG
        <ArrowDown
          class="h-4 w-4 transition-transform group-hover:translate-y-0.5"
          strokeWidth={1.5}
        />
      </a>
    </section>

    <div class="grid gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-12">
      <section aria-labelledby="footer-brand">
        <h2 id="footer-brand" class="text-lg font-bold tracking-[-0.055em]">
          OMG<span class="text-[var(--signal)]">/</span>
        </h2>
        <p class="mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-muted)]">
          Packages, runtimes, and reproducible environments through one CLI.
        </p>
      </section>

      <nav aria-label="Footer navigation">
        <ul class="m-0 flex list-none flex-wrap gap-x-6 gap-y-3 p-0 font-mono text-[10px] text-[var(--ink-muted)]">
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
          <li>
            <a href="mailto:support@latham.cloud" class="hover:text-[var(--ink)]">
              Support
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <p class="m-0 flex flex-col justify-between gap-2 border-t border-[var(--rule)] px-5 py-5 font-mono text-[10px] text-[var(--ink-muted)] sm:flex-row sm:px-8 lg:px-12">
      <span>AGPL-3.0-or-later © 2026 OMG Team</span>
      <span>Built in Rust</span>
    </p>
  </footer>
);

export default Footer;
