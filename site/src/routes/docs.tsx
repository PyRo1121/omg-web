import { Link, Meta, Title } from '@solidjs/meta';
import Footer from '~/components/Footer';
import Header from '~/components/Header';

const REFERENCE_BASE = 'https://github.com/PyRo1121/omg/blob/main/docs';

const REFERENCE_LINKS = [
  { label: 'Installation', href: `${REFERENCE_BASE}/installation.md` },
  { label: 'CLI reference', href: `${REFERENCE_BASE}/cli.md` },
  { label: 'Configuration', href: `${REFERENCE_BASE}/configuration.md` },
  { label: 'Runtime management', href: `${REFERENCE_BASE}/runtimes.md` },
  { label: 'Environment workflows', href: `${REFERENCE_BASE}/workflows.md` },
  { label: 'Security model', href: `${REFERENCE_BASE}/security.md` },
  { label: 'Troubleshooting', href: `${REFERENCE_BASE}/troubleshooting.md` },
  { label: 'Architecture', href: `${REFERENCE_BASE}/architecture.md` },
] as const;

const COMMAND_GROUPS = [
  {
    title: 'Packages',
    description:
      'Search, inspect, install, update, and remove packages through the native backend.',
    commands: ['omg search ripgrep', 'omg info ripgrep', 'omg install ripgrep', 'omg update'],
  },
  {
    title: 'Runtimes',
    description: 'Install and select language versions without learning another version manager.',
    commands: ['omg use node 22', 'omg use python 3.12', 'omg use rust stable'],
  },
  {
    title: 'Environments',
    description: 'Capture the machine state, check drift, and restore a shared environment.',
    commands: ['omg env capture', 'omg env check', 'omg env sync <share-url>'],
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <Title>Documentation - OMG Package Manager</Title>
      <Meta
        name="description"
        content="Install OMG, learn its package and runtime commands, capture reproducible environments, and open the complete CLI reference."
      />
      <Meta name="robots" content="index, follow" />
      <Link rel="canonical" href="https://omg.latham.cloud/docs/" />

      <Header />
      <main id="main-content" class="manifest-shell border-x border-[var(--rule)]">
        <header class="grid gap-10 border-b border-[var(--rule-strong)] px-5 py-20 sm:px-8 lg:grid-cols-[1.25fr_0.75fr] lg:px-12 lg:py-28">
          <div>
            <p class="font-mono text-[10px] tracking-[0.06em] text-[var(--signal)]">
              DOCUMENTATION
            </p>
            <h1 class="mt-8 max-w-[11ch] text-6xl leading-[0.88] font-semibold tracking-[-0.075em] sm:text-8xl">
              Learn the parts you need.
            </h1>
          </div>
          <p class="m-0 max-w-md self-end text-lg leading-relaxed text-[var(--ink-muted)]">
            Start with four commands. Open the full reference when your workflow needs more control.
          </p>
        </header>

        <div class="grid min-w-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside class="border-b border-[var(--rule)] p-5 sm:p-8 lg:border-r lg:border-b-0 lg:p-8">
            <nav class="lg:sticky lg:top-8" aria-label="Documentation sections">
              <p class="font-mono text-[10px] text-[var(--ink-muted)]">ON THIS PAGE</p>
              <ul class="mt-4 grid list-none gap-1 p-0 font-mono text-[11px] text-[var(--ink-muted)] [&_a]:block [&_a]:py-1.5">
                <li>
                  <a href="#install" class="hover:text-[var(--signal)]">
                    Install
                  </a>
                </li>
                <li>
                  <a href="#quick-start" class="hover:text-[var(--signal)]">
                    Quick start
                  </a>
                </li>
                <li>
                  <a href="#platforms" class="hover:text-[var(--signal)]">
                    Platforms
                  </a>
                </li>
                <li>
                  <a href="#reference" class="hover:text-[var(--signal)]">
                    Full reference
                  </a>
                </li>
              </ul>
            </nav>
          </aside>

          <article class="min-w-0">
            <section id="install" class="border-b border-[var(--rule)] p-5 sm:p-8 lg:p-12">
              <h2 class="text-4xl font-semibold tracking-[-0.05em]">Install OMG</h2>
              <p class="mt-4 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
                The universal installer detects Linux or macOS and downloads the matching release.
                Inspect the script before piping it to your shell.
              </p>
              <pre class="mt-8 overflow-x-auto border border-[var(--rule-strong)] bg-[var(--paper-raised)] p-5 text-xs leading-relaxed break-all whitespace-pre-wrap sm:text-sm">
                <code>
                  <span class="text-[var(--signal)]">$ </span>curl -fsSL
                  https://omg.latham.cloud/install.sh | bash
                </code>
              </pre>
              <p class="mt-5 text-sm text-[var(--ink-muted)]">
                Arch users can run <code class="text-[var(--ink)]">yay -S omg-bin</code>. Building
                from source requires Rust 1.93 or newer and uses{' '}
                <code class="break-all text-[var(--ink)]">cargo install omg --locked</code>.
              </p>
            </section>

            <section id="quick-start" class="border-b border-[var(--rule)] p-5 sm:p-8 lg:p-12">
              <h2 class="text-4xl font-semibold tracking-[-0.05em]">Quick start</h2>
              <p class="mt-4 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
                Package operations, runtime selection, and environment state use the same command
                surface.
              </p>
              <div class="mt-10">
                {COMMAND_GROUPS.map((group, index) => (
                  <section class="grid gap-5 border-t border-[var(--rule)] py-8 sm:grid-cols-[0.7fr_1.3fr]">
                    <div>
                      <span class="font-mono text-[10px] text-[var(--signal)]">0{index + 1}</span>
                      <h3 class="mt-3 text-2xl font-semibold tracking-[-0.04em]">{group.title}</h3>
                      <p class="mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-muted)]">
                        {group.description}
                      </p>
                    </div>
                    <pre class="m-0 overflow-x-auto bg-[var(--paper-raised)] p-5 text-sm leading-8">
                      <code>{group.commands.map(command => `$ ${command}`).join('\n')}</code>
                    </pre>
                  </section>
                ))}
              </div>
            </section>

            <section id="platforms" class="border-b border-[var(--rule)] p-5 sm:p-8 lg:p-12">
              <h2 class="text-4xl font-semibold tracking-[-0.05em]">Supported platforms</h2>
              <dl class="mt-8 grid sm:grid-cols-2">
                <div class="border-t border-[var(--rule)] py-6 sm:pr-8">
                  <dt class="font-semibold">Linux</dt>
                  <dd class="m-0 mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                    Arch, Debian, Ubuntu, Fedora, RHEL, and compatible distributions.
                  </dd>
                </div>
                <div class="border-t border-[var(--rule)] py-6 sm:pl-8">
                  <dt class="font-semibold">macOS</dt>
                  <dd class="m-0 mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                    Apple Silicon with Homebrew integration.
                  </dd>
                </div>
                <div class="border-t border-[var(--rule)] py-6 sm:pr-8">
                  <dt class="font-semibold">Windows</dt>
                  <dd class="m-0 mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                    Use OMG inside WSL. Native Windows is not supported.
                  </dd>
                </div>
                <div class="border-t border-[var(--rule)] py-6 sm:pl-8">
                  <dt class="font-semibold">Architecture</dt>
                  <dd class="m-0 mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                    x86_64 Linux and WSL; Apple Silicon on macOS.
                  </dd>
                </div>
              </dl>
            </section>

            <section id="reference" class="p-5 sm:p-8 lg:p-12">
              <h2 class="text-4xl font-semibold tracking-[-0.05em]">Full reference</h2>
              <p class="mt-4 max-w-2xl leading-relaxed text-[var(--ink-muted)]">
                The CLI repository owns the versioned technical reference. These links open the
                source documentation for the current main branch.
              </p>
              <ul class="mt-10 grid list-none p-0 sm:grid-cols-2">
                {REFERENCE_LINKS.map(link => (
                  <li class="border-t border-[var(--rule)] sm:odd:pr-8 sm:even:pl-8">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center justify-between py-5 text-sm font-medium hover:text-[var(--signal)]"
                    >
                      {link.label}
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
