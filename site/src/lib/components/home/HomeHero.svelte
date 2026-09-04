<script lang="ts"></script>

<section class="hero home-shell" aria-labelledby="hero-title">
  <header class="hero-copy">
    <h1 id="hero-title">Stop managing package managers.</h1>
    <p>
      One open-source command installs apps and programming languages on Linux and macOS, replacing
      apt, brew, nvm, pyenv, and friends.
    </p>
    <nav class="hero-actions" aria-label="Homepage introduction">
      <a class="primary-link" href="#install">Install OMG <span aria-hidden="true">↓</span></a>
      <a class="text-link" href="#workflow">See how it works <span aria-hidden="true">→</span></a>
    </nav>
  </header>

  <aside class="hero-motif" aria-label="Seven package tools replaced by one command">
    <p>Seven tools you won’t open again.</p>
    <strong>7<span aria-hidden="true">→</span>1</strong>
    <code><span aria-hidden="true">$ </span>omg install ripgrep</code>
  </aside>
</section>

<style>
  .hero {
    display: grid;
    min-height: calc(100dvh - 4.5rem);
    padding-top: clamp(2rem, 7vh, 5rem);
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0 0 clamp(3.5rem, 8vw, 6rem);
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    max-width: 12ch;
    font-family: var(--font-display);
    font-size: clamp(3.5rem, 8.25vw, 7.8rem);
    font-weight: 650;
    letter-spacing: -0.08em;
    line-height: 0.84;
    text-wrap: balance;
  }

  .hero-copy > p {
    max-width: 39rem;
    margin-top: 2rem;
    color: var(--ink-muted);
    font-size: clamp(1.05rem, 2vw, 1.25rem);
    line-height: 1.7;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.25rem;
    margin-top: 2.5rem;
  }

  .primary-link {
    display: inline-flex;
    min-height: 3.5rem;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 0 1.5rem;
    background: var(--signal);
    color: var(--signal-ink);
    font-weight: 600;
    text-decoration: none;
  }

  .primary-link:hover {
    background: var(--signal-hover);
  }

  .hero-motif {
    display: flex;
    min-height: 22rem;
    flex-direction: column;
    justify-content: space-between;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 2.5rem);
    background: var(--signal);
    color: var(--signal-ink);
  }

  .hero-motif p {
    max-width: 13rem;
    font-size: 1.25rem;
    font-weight: 650;
    letter-spacing: -0.035em;
    line-height: 1.1;
  }

  .hero-motif strong {
    display: block;
    font-size: clamp(6.5rem, 17vw, 10rem);
    font-weight: 650;
    letter-spacing: -0.11em;
    line-height: 0.72;
    white-space: nowrap;
  }

  .hero-motif strong span {
    font-weight: 400;
  }

  .hero-motif code {
    padding-top: 1.25rem;
    border-top: 1px solid rgb(9 9 9 / 0.35);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  @media (min-width: 48rem) {
    .hero {
      grid-template-columns: minmax(0, 1fr) minmax(19rem, 25rem);
      gap: 0;
    }

    .hero-copy {
      padding-right: clamp(3rem, 7vw, 7rem);
    }
  }

  @media (max-width: 47.99rem) {
    .hero {
      width: 100%;
      min-height: calc(100dvh - 4rem);
      padding-top: 2.5rem;
    }

    .hero-copy {
      width: min(100% - 2rem, var(--content-width));
      margin-inline: auto;
      padding-bottom: 2.5rem;
    }

    h1 {
      font-size: clamp(3rem, 14vw, 4.5rem);
      line-height: 0.88;
    }

    .hero-copy > p {
      margin-top: 1.5rem;
      font-size: 1rem;
      line-height: 1.55;
    }

    .hero-actions {
      gap: 0.75rem 1rem;
      margin-top: 1.75rem;
    }

    .hero-motif {
      min-height: 11rem;
      gap: 1rem;
      padding: 1.25rem;
    }

    .hero-motif p {
      display: none;
    }

    .hero-motif strong {
      font-size: clamp(5rem, 25vw, 7rem);
    }
  }
</style>
