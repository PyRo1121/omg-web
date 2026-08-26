<script lang="ts">
  const workflows = [
    {
      title: 'Install an app',
      before: 'Instead of learning apt, pacman, or brew',
      command: 'omg install ripgrep',
      result: 'Installed with your system’s own package manager',
    },
    {
      title: 'Install Node.js, Python, or Rust',
      before: 'Instead of configuring nvm, pyenv, or rustup',
      command: 'omg use node 22',
      result: 'Node 22 installed and ready to use',
    },
    {
      title: 'Set up a new machine',
      before: 'Instead of replaying setup notes from memory',
      command: 'omg env sync <share-url>',
      result: 'Every package and language reinstalled for you',
    },
  ] as const;

  const commands = [
    'omg search ripgrep',
    'omg install ripgrep',
    'omg update',
    'omg use node 22',
    'omg use python 3.12',
    'omg use rust stable',
    'omg env capture',
    'omg env check',
    'omg env sync <share-url>',
  ] as const;
</script>

<section id="workflow" class="workflow home-shell home-section" aria-labelledby="workflow-title">
  <header class="workflow-header">
    <h2 id="workflow-title" class="home-section-title">One interface. Three jobs.</h2>
    <div>
      <p>
        OMG uses the package managers you already trust under the hood. You just learn one command
        instead of seven.
      </p>
      <a class="text-link signal-link" href="/docs/"> Read the full documentation </a>
    </div>
  </header>

  <ol class="workflow-list">
    {#each workflows as workflow (workflow.title)}
      <li>
        <h3>{workflow.title}</h3>
        <p>{workflow.before}</p>
        <div class="command-result">
          <code>{workflow.command}</code>
          <p>{workflow.result}</p>
        </div>
      </li>
    {/each}
  </ol>

  <div class="command-surface">
    <div>
      <h3>That is the whole interface.</h3>
      <p>Search, install, pin, update, capture, restore — the same shape every time.</p>
      <a class="text-link signal-link" href="/docs/"> Full command reference </a>
    </div>
    <ul aria-label="OMG command examples">
      {#each commands as command (command)}
        <li><code>{command}</code></li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .workflow-header,
  .command-surface {
    display: grid;
    gap: clamp(3rem, 6vw, 6rem);
  }

  .workflow-header > div {
    max-width: 36rem;
  }

  .workflow-header p,
  .command-surface > div > p {
    color: var(--ink-muted);
    line-height: 1.7;
  }

  .workflow-header p {
    font-size: 1.1rem;
  }

  .signal-link {
    justify-content: flex-start;
    margin-top: 1.25rem;
    color: var(--signal);
  }

  .workflow-list {
    margin: clamp(4rem, 8vw, 7rem) 0 0;
    padding: 0;
    list-style: none;
  }

  .workflow-list > li {
    display: grid;
    gap: 1.5rem;
    padding-block: 2.5rem;
    border-top: 1px solid var(--rule);
  }

  .workflow-list h3,
  .command-surface h3 {
    font-size: clamp(1.55rem, 3vw, 2.1rem);
    font-weight: 550;
    letter-spacing: -0.045em;
    line-height: 1.05;
  }

  .workflow-list > li > p,
  .command-result p {
    color: var(--ink-muted);
    font-size: 0.875rem;
    line-height: 1.65;
  }

  .command-result code {
    display: block;
    padding: 1rem 1.1rem;
    background: var(--paper-raised);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.86rem;
    overflow-wrap: anywhere;
  }

  .command-result p {
    margin-top: 1rem;
  }

  .command-surface {
    margin-top: 3.5rem;
    padding-top: 3.5rem;
    border-top: 1px solid var(--rule);
  }

  .command-surface > div > p {
    max-width: 27rem;
    margin-top: 1.1rem;
  }

  .command-surface ul {
    display: grid;
    gap: 0.8rem 2.5rem;
    margin: 0;
    padding: 0;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    list-style: none;
  }

  @media (min-width: 48rem) {
    .workflow-header,
    .command-surface {
      grid-template-columns: 0.8fr 1.2fr;
    }

    .workflow-header > div {
      justify-self: end;
    }

    .workflow-list > li {
      grid-template-columns: 0.8fr 0.75fr 1.25fr;
      gap: clamp(2rem, 5vw, 5rem);
    }

    .workflow-list > li > p {
      max-width: 15rem;
    }

    .command-surface ul {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
