import type { Component } from 'solid-js';
import { GitHubIcon } from './ui/BrandIcons';

const Footer: Component = () => (
  <footer class="manifest-shell border-y border-[var(--ink)]">
    <div class="grid lg:grid-cols-[2fr_1fr]">
      <div class="flex min-h-64 flex-col justify-between border-b border-[var(--ink)] p-6 sm:p-10 lg:border-r lg:border-b-0">
        <div class="flex items-center gap-3">
          <span class="grid h-10 w-10 place-items-center bg-[var(--ink)] font-mono text-sm font-semibold text-[var(--paper)]">
            O/
          </span>
          <strong class="text-xl tracking-[-0.04em]">OMG Package Manager</strong>
        </div>
        <p class="max-w-xl text-3xl leading-tight font-semibold tracking-[-0.04em]">
          One operational interface for packages, runtimes, and reproducible environments.
        </p>
      </div>

      <nav class="grid grid-cols-2" aria-label="Footer navigation">
        <a
          href="/docs/"
          class="manifest-label flex items-center border-r border-b border-[var(--rule)] p-5 hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          Manual
        </a>
        <a
          href="https://github.com/PyRo1121/omg"
          target="_blank"
          rel="noopener noreferrer"
          class="manifest-label flex items-center gap-2 border-b border-[var(--rule)] p-5 hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          <GitHubIcon class="h-4 w-4" />
          Source
        </a>
        <a
          href="/privacy"
          class="manifest-label flex items-center border-r border-[var(--rule)] p-5 hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          Privacy
        </a>
        <a
          href="/terms"
          class="manifest-label flex items-center p-5 hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          Terms
        </a>
      </nav>
    </div>
    <div class="manifest-label flex flex-col justify-between gap-3 border-t border-[var(--ink)] px-6 py-4 text-[var(--ink-muted)] sm:flex-row sm:px-10">
      <span>AGPL-3.0-or-later © 2026 OMG Team</span>
      <a href="mailto:support@latham.cloud" class="text-[var(--ink)] hover:text-[var(--signal)]">
        support@latham.cloud
      </a>
    </div>
  </footer>
);

export default Footer;
