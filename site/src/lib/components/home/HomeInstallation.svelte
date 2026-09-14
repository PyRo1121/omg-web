<script lang="ts">
  import { InstallationView } from '../../installation.svelte';
  const installation = new InstallationView();
</script>

<section id="install" class="installation home-shell home-section" aria-labelledby="install-title">
  <header>
    <h2 id="install-title" class="home-section-title">Install once. Start simplifying.</h2>
    <p class="home-section-intro">
      Linux or macOS. Download the installer, review it, then run it.
    </p>
  </header>
  <div class="install-command">
    <pre><code>{installation.command}</code></pre>
    <div class="install-actions">
      <button type="button" disabled={installation.pending} onclick={() => installation.copy()}
        >Copy install command</button
      >
      <a href="https://github.com/PyRo1121/omg/releases"
        >Download from GitHub <span aria-hidden="true">↗</span></a
      >
    </div>
    <p class="copy-status" role="status">{installation.message}</p>
  </div>
</section>

<style>
  .installation {
    display: grid;
    gap: clamp(2rem, 5vw, 4rem);
  }
  header {
    max-width: 42rem;
  }
  .install-command {
    min-width: 0;
    padding-block: 2rem;
    border-block: 1px solid var(--rule);
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  code {
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: clamp(0.85rem, 1.7vw, 1.15rem);
    line-height: 1.9;
  }
  .install-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.25rem 2rem;
    margin-top: 2rem;
  }
  button {
    min-height: 2.75rem;
    padding: 0.6rem 1rem;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--signal);
  }
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--signal);
    outline-offset: 4px;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  a {
    color: var(--ink);
    text-decoration-color: var(--signal);
    text-underline-offset: 0.3em;
  }
  .copy-status {
    min-height: 3em;
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }
</style>
