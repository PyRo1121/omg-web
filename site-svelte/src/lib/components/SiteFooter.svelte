<script lang="ts">
  import BrandMark from './BrandMark.svelte';
</script>

<footer class="site-footer">
  <section class="footer-callout" aria-labelledby="footer-callout-title">
    <div>
      <p class="callout-label">OMG Package Manager</p>
      <h2 id="footer-callout-title">One command. Your whole machine.</h2>
      <p class="callout-copy">Free to install. No account required until you want Pro.</p>
    </div>
    <a class="footer-action" href="/#install">
      Install OMG
      <span aria-hidden="true">↓</span>
    </a>
  </section>

  <div class="footer-bar">
    <a class="footer-brand" href="/" aria-label="OMG Package Manager home">
      <BrandMark />
    </a>

    <nav aria-label="Footer navigation">
      <ul class="footer-links">
        <li><a href="/docs/">Docs</a></li>
        <li>
          <a href="https://github.com/PyRo1121/omg" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </li>
        <li><a href="/privacy/">Privacy</a></li>
        <li><a href="/terms/">Terms</a></li>
      </ul>
    </nav>
  </div>
</footer>

<style>
  .site-footer {
    width: min(100%, 90rem);
    margin: 0 auto;
    padding-inline: clamp(1rem, 4vw, 3rem);
    border-top: 1px solid var(--rule);
  }

  .footer-callout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 3rem;
    align-items: end;
    padding-block: clamp(4.5rem, 10vw, 8rem);
  }

  .callout-label {
    margin: 0 0 1.25rem;
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    max-width: 12ch;
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.75rem, 7vw, 5rem);
    font-weight: 650;
    letter-spacing: -0.065em;
    line-height: 0.9;
  }

  .callout-copy {
    max-width: 34rem;
    margin: 1.75rem 0 0;
    color: var(--ink-muted);
    font-size: clamp(1rem, 2vw, 1.125rem);
    line-height: 1.7;
  }

  .footer-action {
    display: inline-flex;
    min-height: 3.5rem;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding-inline: 1.5rem;
    border: 1px solid var(--signal);
    background: var(--signal);
    color: var(--signal-ink);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
  }

  .footer-action:hover {
    border-color: var(--signal-hover);
    background: var(--signal-hover);
  }

  .footer-action span {
    font-size: 1.125rem;
  }

  .footer-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem 3rem;
    align-items: center;
    justify-content: space-between;
    padding-block: 1.5rem;
    border-top: 1px solid var(--rule);
  }

  .footer-brand {
    color: var(--ink);
    text-decoration: none;
  }

  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem clamp(1.25rem, 3vw, 2rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .footer-links a {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .footer-links a:hover {
    color: var(--ink);
  }

  @media (max-width: 39.99rem) {
    .footer-callout {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .footer-action {
      width: 100%;
    }

    .footer-bar,
    .footer-links {
      align-items: flex-start;
    }

    .footer-bar {
      flex-direction: column;
    }
  }
</style>
