<script lang="ts">
  import { InstallationView } from '../../installation.svelte';

  const installation = new InstallationView();
</script>

<section id="install" class="installation home-shell home-section" aria-labelledby="install-title">
  <header class="install-copy">
    <h2 id="install-title" class="home-section-title">Install once. Start simplifying.</h2>
    <p class="home-section-intro">Choose your platform. Review the installer before it runs.</p>
  </header>

  <div class="install-options">
    {#each installation.methods as method (method.platform)}
      <article>
        <h3>{method.platform}</h3>
        <code><span aria-hidden="true">$ </span>{method.command}</code>
        <div>
          <button
            type="button"
            aria-label={`Copy ${method.platform} command`}
            disabled={installation.pending}
            onclick={() => installation.copy(method)}>Copy command</button
          >
          <p class="copy-status" role="status" aria-label={method.platform}>
            {installation.messageFor(method)}
          </p>
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .installation {
    display: grid;
    gap: clamp(3rem, 7vw, 6rem);
  }

  .install-copy {
    max-width: 42rem;
  }

  .install-options {
    display: grid;
    background: var(--paper-raised);
  }

  .install-options article {
    display: grid;
    align-content: space-between;
    gap: 2rem;
    min-width: 0;
    padding: clamp(1.5rem, 4vw, 2.5rem);
    border-top: 1px solid var(--rule);
  }

  .install-options article:first-child {
    border-top: 0;
  }

  .install-options h3 {
    color: var(--ink-muted);
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .install-options code {
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: clamp(0.78rem, 2vw, 1rem);
    line-height: 1.7;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .install-options code span {
    color: var(--signal);
  }

  .install-options button {
    min-height: 2.75rem;
    padding: 0.6rem 1rem;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  .install-options button:hover:not(:disabled) {
    border-color: var(--signal);
  }

  .install-options button:focus-visible {
    outline: 2px solid var(--signal);
    outline-offset: 4px;
  }

  .install-options button:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .copy-status {
    min-height: 3em;
    margin: 0.75rem 0 0;
    font-size: 0.875rem;
    color: var(--ink-muted);
  }

  @media (min-width: 48rem) {
    .install-options {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .install-options article {
      border-top: 0;
      border-left: 1px solid var(--rule);
    }

    .install-options article:first-child {
      border-left: 0;
    }
  }
</style>
