<script lang="ts">
  const workflows = [
    {
      number: '01',
      title: 'Packages, without the context switch.',
      detail:
        'Find and install software through your system package manager using the same command shape.',
      command: 'omg install ripgrep',
      href: '/docs/cli/',
      link: 'Package commands',
    },
    {
      number: '02',
      title: 'The right runtime for the project.',
      detail:
        'Choose a Node.js, Python, or Rust version without juggling a different interface for each language.',
      command: 'omg use node 22',
      href: '/docs/runtimes/',
      link: 'Runtime guide',
    },
    {
      number: '03',
      title: 'An environment you can take with you.',
      detail:
        'Capture a working setup and use a shared environment to bring another machine into sync.',
      command: 'omg env sync <share-url>',
      href: '/docs/cli/',
      link: 'Environment commands',
    },
  ] as const;
</script>

<section id="workflow" class="workflow home-shell home-section" aria-labelledby="workflow-title">
  <header class="workflow-header">
    <p class="section-label">The everyday workflow</p>
    <h2 id="workflow-title">One interface.<br />Three jobs.</h2>
    <a class="text-link" href="/docs/"
      >Read the full documentation <span aria-hidden="true">↗</span></a
    >
  </header>
  <ol class="workflow-list">
    {#each workflows as workflow (workflow.number)}
      <li>
        <span class="workflow-number" aria-hidden="true">{workflow.number}</span>
        <div class="workflow-copy">
          <h3>{workflow.title}</h3>
          <p>{workflow.detail}</p>
          <a href={workflow.href}>{workflow.link} <span aria-hidden="true">↗</span></a>
        </div>
        <code>{workflow.command}</code>
      </li>
    {/each}
  </ol>
</section>

<style>
  .workflow-header {
    display: grid;
    gap: 1.5rem;
    margin-bottom: clamp(2.5rem, 5vw, 4rem);
  }
  .section-label,
  .workflow-number {
    margin: 0;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 5.7vw, 5.5rem);
    font-weight: 550;
    letter-spacing: -0.06em;
    line-height: 1;
  }
  .workflow-header > a {
    justify-self: start;
  }
  .workflow-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .workflow-list > li {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: 1.5rem 1rem;
    padding-block: clamp(2rem, 4vw, 3.5rem);
    border-top: 1px solid var(--rule);
  }
  .workflow-number {
    padding-top: 0.4rem;
  }
  h3 {
    max-width: 26ch;
    margin: 0;
    font-size: clamp(1.4rem, 2.5vw, 2rem);
    font-weight: 550;
    letter-spacing: -0.035em;
    line-height: 1.15;
  }
  .workflow-copy p {
    max-width: 44ch;
    margin-block: 1rem;
    color: var(--ink-muted);
    line-height: 1.7;
  }
  .workflow-copy a {
    color: var(--ink);
    text-underline-offset: 0.3em;
    text-decoration-color: var(--signal);
    font-size: 0.875rem;
  }
  .workflow-list code {
    grid-column: 2;
    align-self: center;
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: clamp(0.8rem, 1.5vw, 1.1rem);
    overflow-wrap: anywhere;
  }
  @media (min-width: 60rem) {
    .workflow-header {
      grid-template-columns: 1fr 1fr;
      align-items: end;
    }
    .section-label {
      grid-column: 1 / -1;
    }
    .workflow-header > a {
      justify-self: end;
    }
    .workflow-list > li {
      grid-template-columns: 3rem minmax(0, 1.2fr) minmax(0, 1fr);
      gap: 2rem;
    }
    .workflow-list code {
      grid-column: 3;
      justify-self: end;
    }
  }
</style>
