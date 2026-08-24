import type { Component } from 'solid-js';
import { GitHubIcon } from './ui/BrandIcons';

const Footer: Component = () => (
  <footer class="border-t border-[var(--rule)] py-10">
    <div class="manifest-shell grid gap-10 sm:grid-cols-[1fr_auto] sm:items-end">
      <section aria-labelledby="footer-brand">
        <h2
          id="footer-brand"
          class="flex items-center gap-3 text-lg font-semibold tracking-[-0.035em]"
        >
          <span class="grid h-9 w-9 place-items-center rounded-full bg-[var(--signal)] font-mono text-xs text-[var(--signal-ink)]">
            O/
          </span>
          OMG Package Manager
        </h2>
        <p class="mt-5 max-w-lg text-sm leading-relaxed text-[var(--ink-muted)]">
          One interface for Linux packages, language runtimes, and reproducible development
          environments.
        </p>
      </section>

      <nav aria-label="Footer navigation">
        <ul class="m-0 flex list-none flex-wrap gap-x-6 gap-y-3 p-0 text-sm text-[var(--ink-muted)]">
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
              class="flex items-center gap-2 hover:text-[var(--ink)]"
            >
              <GitHubIcon class="h-4 w-4" /> GitHub
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

    <p class="manifest-shell mt-10 flex flex-col justify-between gap-3 border-t border-[var(--rule)] pt-6 font-mono text-[10px] text-[#69736b] sm:flex-row">
      <span>AGPL-3.0-or-later © 2026 OMG Team</span>
      <a href="mailto:support@latham.cloud" class="hover:text-[var(--ink)]">
        support@latham.cloud
      </a>
    </p>
  </footer>
);

export default Footer;
