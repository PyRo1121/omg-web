<script lang="ts">
  const breadcrumbData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://omg.latham.cloud/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Docs',
        item: 'https://omg.latham.cloud/docs/',
      },
    ],
  });

  const commandGroups = [
    {
      number: '01',
      title: 'Packages',
      description:
        'Search, inspect, install, update, and remove packages through the native backend.',
      commands: ['omg search ripgrep', 'omg info ripgrep', 'omg install ripgrep', 'omg update'],
    },
    {
      number: '02',
      title: 'Runtimes',
      description: 'Install and select language versions without learning another version manager.',
      commands: ['omg use node 22', 'omg use python 3.12', 'omg use rust stable'],
    },
    {
      number: '03',
      title: 'Environments',
      description: 'Capture the machine state, check drift, and restore a shared environment.',
      commands: ['omg env capture', 'omg env check', 'omg env sync <share-url>'],
    },
  ] as const;

  const referenceLinks = [
    {
      label: 'Installation',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/installation.md',
    },
    {
      label: 'CLI reference',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/cli.md',
    },
    {
      label: 'Configuration',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/configuration.md',
    },
    {
      label: 'Runtime management',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/runtimes.md',
    },
    {
      label: 'Environment workflows',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/workflows.md',
    },
    {
      label: 'Security model',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/security.md',
    },
    {
      label: 'Troubleshooting',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/troubleshooting.md',
    },
    {
      label: 'Architecture',
      href: 'https://github.com/PyRo1121/omg/blob/main/docs/architecture.md',
    },
  ] as const;
</script>

<svelte:head>
  <title>OMG Documentation - Install, Commands, and Platforms</title>
  <meta
    name="description"
    content="Install OMG, learn its package and runtime commands, capture reproducible environments, and open the complete CLI reference."
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://omg.latham.cloud/docs/" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="OMG Documentation - Install, Commands, and Platforms" />
  <meta
    property="og:description"
    content="Install OMG, learn its package and runtime commands, capture reproducible environments, and open the complete CLI reference."
  />
  <meta property="og:url" content="https://omg.latham.cloud/docs/" />
  <meta property="og:image" content="https://omg.latham.cloud/og/omg-og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta
    property="og:image:alt"
    content="The OMG landing page headline beside a large orange 7→1 graphic representing seven package tools replaced by one command."
  />
  <meta property="og:site_name" content="OMG Package Manager" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="OMG Documentation - Install, Commands, and Platforms" />
  <meta
    name="twitter:description"
    content="Install OMG, learn its package and runtime commands, capture reproducible environments, and open the complete CLI reference."
  />
  <meta name="twitter:image" content="https://omg.latham.cloud/og/omg-og.png" />
  <svelte:element this={"script"} type="application/ld+json">{breadcrumbData}</svelte:element>
</svelte:head>

<main id="main-content" class="docs-shell">
  <header class="docs-hero">
    <div>
      <p class="page-kicker">Documentation</p>
      <h1>Learn the parts you need.</h1>
    </div>
    <p class="hero-copy">
      Start with four commands. Open the full reference when your workflow needs more control.
    </p>
  </header>

  <div class="docs-layout">
    <aside class="docs-aside">
      <nav class="section-nav" aria-label="Documentation sections">
        <p>On this page</p>
        <ul>
          <li><a href="#install">Install</a></li>
          <li><a href="#quick-start">Quick start</a></li>
          <li><a href="#platforms">Platforms</a></li>
          <li><a href="#reference">Full reference</a></li>
        </ul>
      </nav>
    </aside>

    <article>
      <section id="install" class="docs-section">
        <h2>Install OMG</h2>
        <p class="section-copy">
          The universal installer detects Linux or macOS and downloads the matching release. Inspect
          the script before piping it to your shell.
        </p>
        <pre class="install-command"><code
            ><span>$ </span>curl -fsSL https://omg.latham.cloud/install.sh | bash</code
          ></pre>
        <p class="install-note">
          Arch users can run <code>yay -S omg-bin</code>. Building from source requires Rust 1.93 or
          newer and uses <code>cargo install omg --locked</code>.
        </p>
      </section>

      <section id="quick-start" class="docs-section">
        <h2>Quick start</h2>
        <p class="section-copy">
          Package operations, runtime selection, and environment state use the same command surface.
        </p>
        <div class="command-groups">
          {#each commandGroups as group (group.title)}
            <section class="command-group">
              <div>
                <span class="group-number">{group.number}</span>
                <h3>{group.title}</h3>
                <p>{group.description}</p>
              </div>
              <pre><code>{group.commands.map(command => `$ ${command}`).join('\n')}</code></pre>
            </section>
          {/each}
        </div>
      </section>

      <section id="platforms" class="docs-section">
        <h2>Platforms: Arch, Debian, Ubuntu, Fedora, and macOS</h2>
        <dl class="platform-list">
          <div>
            <dt>Linux</dt>
            <dd>Arch, Debian, Ubuntu, Fedora, RHEL, and compatible distributions.</dd>
          </div>
          <div>
            <dt>macOS</dt>
            <dd>Apple Silicon with Homebrew integration.</dd>
          </div>
          <div>
            <dt>Windows</dt>
            <dd>Use OMG inside WSL. Native Windows is not supported.</dd>
          </div>
          <div>
            <dt>Architecture</dt>
            <dd>x86_64 Linux and WSL; Apple Silicon on macOS.</dd>
          </div>
        </dl>
      </section>

      <section id="reference" class="docs-section reference-section">
        <h2>OMG CLI reference</h2>
        <p class="section-copy">
          The CLI repository owns the versioned technical reference. These links open the source
          documentation for the current main branch.
        </p>
        <ul class="reference-list">
          {#each referenceLinks as link (link.href)}
            <li>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    </article>
  </div>
</main>

<style>
  .docs-shell {
    width: min(100%, 90rem);
    margin-inline: auto;
    border-inline: 1px solid var(--rule);
  }

  .docs-hero {
    display: grid;
    gap: 2.5rem;
    padding: clamp(5rem, 10vw, 7rem) clamp(1.25rem, 4vw, 3rem);
    border-bottom: 1px solid var(--rule-strong);
  }

  .docs-hero h1 {
    max-width: 11ch;
    margin: 2rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(3.75rem, 9vw, 6rem);
    font-weight: 650;
    letter-spacing: -0.075em;
    line-height: 0.88;
    text-wrap: balance;
  }

  .hero-copy {
    max-width: 28rem;
    margin: 0;
    align-self: end;
    color: var(--ink-muted);
    font-size: 1.125rem;
    line-height: 1.7;
  }

  .docs-layout {
    display: grid;
    min-width: 0;
  }

  .docs-aside {
    padding: 1.25rem;
    border-bottom: 1px solid var(--rule);
  }

  .section-nav p,
  .section-nav a,
  .group-number {
    font-family: var(--font-mono);
  }

  .section-nav p {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.625rem;
    text-transform: uppercase;
  }

  .section-nav ul,
  .reference-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .section-nav ul {
    display: grid;
    gap: 0.0625rem;
    margin-top: 1rem;
  }

  .section-nav a {
    display: block;
    padding-block: 0.375rem;
    color: var(--ink-muted);
    font-size: 0.6875rem;
    text-decoration: none;
  }

  .section-nav a:hover,
  .reference-list a:hover {
    color: var(--signal);
  }

  article {
    min-width: 0;
  }

  .docs-section {
    padding: clamp(2rem, 5vw, 3rem) clamp(1.25rem, 4vw, 3rem);
    border-bottom: 1px solid var(--rule);
    scroll-margin-top: 2rem;
  }

  .docs-section h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.25rem, 5vw, 2.5rem);
    font-weight: 650;
    letter-spacing: -0.05em;
    line-height: 1;
    text-wrap: balance;
  }

  .section-copy {
    max-width: 42rem;
    margin: 1rem 0 0;
    color: var(--ink-muted);
    line-height: 1.7;
  }

  pre {
    margin: 0;
    overflow-x: auto;
    background: var(--paper-raised);
    color: var(--ink);
    font-family: var(--font-mono);
  }

  code {
    font-family: var(--font-mono);
  }

  .install-command {
    margin-top: 2rem;
    padding: 1.25rem;
    border: 1px solid var(--rule-strong);
    font-size: clamp(0.75rem, 2vw, 0.875rem);
    line-height: 1.7;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .install-command span,
  .group-number {
    color: var(--signal);
  }

  .install-note {
    margin: 1.25rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .install-note code {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .command-groups {
    margin-top: 2.5rem;
  }

  .command-group {
    display: grid;
    gap: 1.25rem;
    padding-block: 2rem;
    border-top: 1px solid var(--rule);
  }

  .group-number {
    font-size: 0.625rem;
  }

  .command-group h3 {
    margin: 0.75rem 0 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.04em;
  }

  .command-group p {
    max-width: 24rem;
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
    line-height: 1.7;
  }

  .command-group pre {
    padding: 1.25rem;
    font-size: 0.875rem;
    line-height: 2;
  }

  .platform-list {
    display: grid;
    margin: 2rem 0 0;
  }

  .platform-list > div {
    padding-block: 1.5rem;
    border-top: 1px solid var(--rule);
  }

  .platform-list dt {
    font-weight: 650;
  }

  .platform-list dd {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
    line-height: 1.7;
  }

  .reference-section {
    border-bottom: 0;
  }

  .reference-list {
    display: grid;
    margin-top: 2.5rem;
  }

  .reference-list li {
    border-top: 1px solid var(--rule);
  }

  .reference-list a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-block: 1.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }

  @media (min-width: 40rem) {
    .docs-aside {
      padding: 2rem;
    }

    .command-group {
      grid-template-columns: 0.7fr 1.3fr;
    }

    .platform-list,
    .reference-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .platform-list > div:nth-child(odd),
    .reference-list li:nth-child(odd) {
      padding-right: 2rem;
    }

    .platform-list > div:nth-child(even),
    .reference-list li:nth-child(even) {
      padding-left: 2rem;
    }
  }

  @media (min-width: 64rem) {
    .docs-hero {
      grid-template-columns: 1.25fr 0.75fr;
    }

    .docs-layout {
      grid-template-columns: 16rem minmax(0, 1fr);
    }

    .docs-aside {
      padding: 2rem;
      border-right: 1px solid var(--rule);
      border-bottom: 0;
    }

    .section-nav {
      position: sticky;
      top: 2rem;
    }
  }
</style>
