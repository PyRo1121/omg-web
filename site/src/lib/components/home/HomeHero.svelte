<section class="hero home-shell" aria-labelledby="hero-title">
  <p class="hero-eyebrow">Free and open source. Built in Rust. No account required.</p>
  <h1 id="hero-title">Packages &amp; runtimes.<br /><span>One command.</span></h1>
  <div class="hero-introduction">
    <p>
      Manage system packages and <a href="/runtimes/node/">Node.js</a>,
      <a href="/runtimes/bun/">Bun</a>, and <a href="/runtimes/python/">Python</a> versions with one
      free CLI for Linux, macOS, and WSL. Keep your
      <a href="/guides/node-npm-pnpm/">npm and pnpm workflows</a> and share a consistent environment.
    </p>
    <nav class="hero-actions" aria-label="Homepage introduction">
      <a class="primary-link" href="#install">Install OMG <span aria-hidden="true">↓</span></a>
      <a class="text-link" href="#workflow">See how it works <span aria-hidden="true">→</span></a>
    </nav>
  </div>
  <div class="command-line" aria-label="Example package installation command">
    <span class="command-label">Start with a package</span>
    <code><span aria-hidden="true">$ </span>omg install ripgrep</code>
    <span class="platforms">Linux / macOS</span>
  </div>
</section>

<style>
  .hero {
    padding-block: clamp(3rem, 8vw, 7rem) 0;
  }

  .hero-eyebrow {
    margin: 0 0 clamp(2rem, 4vw, 4rem);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.7;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 7.8vw, 7rem);
    font-weight: 650;
    letter-spacing: -0.075em;
    line-height: 0.95;
  }

  h1 > span {
    color: var(--signal);
  }

  .hero-introduction {
    display: grid;
    gap: 2rem;
    margin-block: clamp(2rem, 5vw, 4rem) clamp(3rem, 6vw, 5rem);
  }

  .hero-introduction > p {
    max-width: 38rem;
    margin: 0;
    color: var(--ink-muted);
    font-size: clamp(1rem, 1.5vw, 1.25rem);
    line-height: 1.7;
    text-wrap: pretty;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1.25rem 2rem;
  }

  .primary-link {
    display: inline-flex;
    min-height: 3.5rem;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    padding-inline: 1.5rem;
    background: var(--signal);
    color: var(--signal-ink);
    font-weight: 600;
    text-decoration: none;
  }

  .primary-link:hover {
    background: var(--signal-hover);
  }

  .command-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 1rem 3rem;
    padding-block: 1.5rem;
    border-block: 1px solid var(--rule);
  }

  .command-label,
  .platforms {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .command-line code {
    font-family: var(--font-mono);
    font-size: clamp(1rem, 2vw, 1.4rem);
    overflow-wrap: anywhere;
  }

  .command-line code span {
    color: var(--signal);
  }

  @media (min-width: 60rem) {
    .hero-introduction {
      grid-template-columns: 1.15fr 1fr;
      align-items: center;
    }
    .hero-actions {
      justify-content: flex-end;
    }
    .platforms {
      margin-left: auto;
    }
  }

  @media (max-width: 35rem) {
    .command-label {
      flex-basis: 100%;
    }
  }
</style>
