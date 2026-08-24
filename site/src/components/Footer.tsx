import type { Component } from 'solid-js';
import GitHubActivity from './GitHubActivity';
import { GitHubIcon } from './ui/BrandIcons';

const Footer: Component = () => {
  return (
    <footer class="border-t border-white/5 px-6 py-12">
      <div class="mx-auto max-w-7xl">
        <div class="mb-12 grid gap-8 md:grid-cols-4">
          <div>
            <div class="mb-4 flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-bold">
                ⚡
              </div>
              <span class="text-xl font-bold">OMG</span>
            </div>
            <p class="text-sm text-slate-400">
              The fastest unified package manager for Linux. Built with pure Rust.
            </p>
          </div>

          <div>
            <h4 class="mb-4 font-semibold">Product</h4>
            <ul class="space-y-2 text-sm text-slate-400">
              <li>
                <a href="#features" class="transition-colors hover:text-white">
                  Features
                </a>
              </li>
              <li>
                <a href="#benchmarks" class="transition-colors hover:text-white">
                  Benchmarks
                </a>
              </li>
              <li>
                <a href="#pricing" class="transition-colors hover:text-white">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#install" class="transition-colors hover:text-white">
                  Installation
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 class="mb-4 font-semibold">Resources</h4>
            <ul class="space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href="https://github.com/PyRo1121/omg/"
                  class="transition-colors hover:text-white"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/PyRo1121/omg/blob/main/README.md"
                  class="transition-colors hover:text-white"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/PyRo1121/omg/releases"
                  class="transition-colors hover:text-white"
                >
                  Releases
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/PyRo1121/omg/issues"
                  class="transition-colors hover:text-white"
                >
                  Issues
                </a>
              </li>
            </ul>
          </div>

          <div>
            {/* No /privacy or /terms routes exist yet; link them once they ship. */}
            <h4 class="mb-4 font-semibold">Legal</h4>
            <ul class="space-y-2 text-sm text-slate-400">
              <li>
                <a href="mailto:support@latham.cloud" class="transition-colors hover:text-white">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <GitHubActivity />

        <div class="flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 md:flex-row">
          <p class="text-sm text-slate-500">AGPL-3.0-or-later © 2026 OMG Team</p>
          <div class="flex items-center gap-6">
            <a
              href="https://github.com/PyRo1121/omg"
              class="text-slate-400 transition-colors hover:text-white"
              aria-label="OMG Package Manager on GitHub"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GitHubIcon class="h-6 w-6" />
            </a>
            <a
              href="https://twitter.com/pyro1121"
              class="text-slate-400 transition-colors hover:text-white"
              aria-label="OMG Package Manager on X (Twitter)"
              rel="noopener noreferrer"
              target="_blank"
            >
              <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
