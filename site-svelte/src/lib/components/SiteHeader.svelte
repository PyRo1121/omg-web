<script lang="ts">
  import BrandMark from './BrandMark.svelte';
</script>

<header class="site-header">
  <nav class="header-shell" aria-label="Primary navigation">
    <a class="brand" href="/" aria-label="OMG Package Manager home">
      <BrandMark />
    </a>

    <div class="primary-nav">
      <ul class="primary-links">
        <li><a href="/#workflow">Workflow</a></li>
        <li><a href="/#benchmarks">Speed</a></li>
        <li><a href="/#pricing">Plans</a></li>
        <li><a href="/docs/">Docs</a></li>
        <li>
          <a href="https://github.com/PyRo1121/omg/" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </li>
      </ul>
    </div>

    <div class="account-actions">
      <a class="account-link" href="/dashboard/">Account</a>
      <a class="primary-action" href="/#install">Install OMG</a>
    </div>
  </nav>
</header>

<style>
  .site-header {
    position: relative;
    z-index: 20;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
  }

  .header-shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    width: min(100%, 90rem);
    min-height: 4.5rem;
    margin: 0 auto;
    padding-inline: clamp(1rem, 4vw, 3rem);
  }

  .brand,
  .primary-links a,
  .account-link,
  .primary-action {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    text-decoration: none;
  }

  .brand {
    align-self: center;
    padding-right: clamp(1.25rem, 3vw, 3rem);
    color: var(--ink);
  }

  .primary-nav {
    min-width: 0;
  }

  .primary-links {
    display: flex;
    height: 100%;
    align-items: stretch;
    gap: clamp(1rem, 2.5vw, 2rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .primary-links a,
  .account-link {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .primary-links a:hover,
  .account-link:hover {
    color: var(--ink);
  }

  .account-actions {
    display: flex;
    align-items: stretch;
    margin-left: clamp(1rem, 3vw, 3rem);
  }

  .account-link {
    padding-inline: clamp(0.75rem, 2vw, 1.25rem);
  }

  .primary-action {
    min-width: 7.75rem;
    justify-content: center;
    padding-inline: 1.25rem;
    background: var(--signal);
    color: var(--signal-ink);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .primary-action:hover {
    background: var(--signal-hover);
  }

  @media (max-width: 47.99rem) {
    .header-shell {
      grid-template-columns: auto minmax(0, 1fr);
      min-height: 4rem;
      padding-inline: 0;
    }

    .brand {
      padding-inline: 1rem;
    }

    .account-actions {
      justify-self: end;
      margin-left: 0;
    }

    .account-link {
      padding-inline: 0.75rem;
    }

    .primary-action {
      min-width: auto;
      padding-inline: 1rem;
    }

    .primary-nav {
      display: none;
    }
  }
</style>
