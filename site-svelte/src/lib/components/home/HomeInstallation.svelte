<script lang="ts">
  const installMethods = [
    {
      platform: 'Linux / macOS',
      command:
        'curl -fsSL https://omg.latham.cloud/install.sh -o omg-install.sh\nless omg-install.sh && bash omg-install.sh',
    },
    { platform: 'Arch / AUR', command: 'yay -S omg-bin' },
    { platform: 'From source', command: 'cargo install omg --locked' },
  ] as const;
</script>

<section id="install" class="installation home-shell home-section" aria-labelledby="install-title">
  <header class="install-copy">
    <h2 id="install-title" class="home-section-title">Install once. Start simplifying.</h2>
    <p class="home-section-intro">Choose your platform. Review the installer before it runs.</p>
  </header>

  <div class="install-options">
    {#each installMethods as method (method.platform)}
      <article>
        <h3>{method.platform}</h3>
        <code><span aria-hidden="true">$ </span>{method.command}</code>
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
