<script lang="ts">
  import type { DocsBlock } from '../../docs/topic';

  let { block }: { block: DocsBlock } = $props();
  const titleId = $props.id();
</script>

{#if block.kind === 'paragraphs'}
  <div class="paragraphs">
    {#each block.paragraphs as paragraph}
      <p>{paragraph}</p>
    {/each}
  </div>
{:else if block.kind === 'commands'}
  <section class="commands-block">
    <h3>{block.title}</h3>
    <pre><code>{block.commands.join('\n')}</code></pre>
  </section>
{:else if block.kind === 'steps'}
  <ol class="steps-block">
    {#each block.steps as step}
      <li>
        <p>{step.text}</p>
        {#if step.command}
          <pre><code>{step.command}</code></pre>
        {/if}
      </li>
    {/each}
  </ol>
{:else if block.kind === 'table'}
  <section class="table-block">
    <h3 id={titleId}>{block.title}</h3>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access for horizontal scrolling) -->
    <div class="table-scroll" role="region" aria-labelledby={titleId} tabindex="0">
      <table>
        <thead>
          <tr>
            <th scope="col">{block.columns[0]}</th>
            <th scope="col">{block.columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {#each block.rows as row}
            <tr>
              <td>{row[0]}</td>
              <td>{row[1]}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{:else if block.kind === 'bullets'}
  <ul class="bullets-block">
    {#each block.items as item}
      <li>{item}</li>
    {/each}
  </ul>
{:else}
  <aside class="note note-{block.tone}">
    <p>{block.text}</p>
  </aside>
{/if}

<style>
  .paragraphs p {
    max-width: 46rem;
    margin: 1rem 0 0;
    color: var(--ink-muted);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  h3 {
    margin: 2.25rem 0 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 650;
    letter-spacing: -0.03em;
  }

  pre {
    margin: 1rem 0 0;
    padding: 1rem 1.25rem;
    overflow-x: auto;
    background: var(--paper-raised);
    border: 1px solid var(--rule);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.8;
  }

  code {
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }

  .steps-block {
    margin: 1rem 0 0;
    padding: 0;
    padding-left: 1.25rem;
    color: var(--ink-muted);
    line-height: 1.7;
  }

  .steps-block li {
    padding-block: 0.5rem;
    overflow-wrap: anywhere;
  }

  .steps-block li::marker {
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .steps-block pre {
    margin-block: 0.5rem;
  }

  .table-block {
    margin-top: 0.25rem;
  }

  .table-scroll {
    margin-top: 1rem;
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 34rem;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: 0.75rem 1rem 0.75rem 0;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    vertical-align: top;
    line-height: 1.6;
  }

  th {
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--rule-strong);
  }

  td {
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }

  td:first-child {
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .bullets-block {
    max-width: 46rem;
    margin: 1rem 0 0;
    padding: 0;
    padding-left: 1.25rem;
    color: var(--ink-muted);
    line-height: 1.7;
  }

  .bullets-block li {
    padding-block: 0.375rem;
    overflow-wrap: anywhere;
  }

  .bullets-block li::marker {
    color: var(--signal);
  }

  .note {
    max-width: 46rem;
    margin: 1.5rem 0 0;
    padding: 1rem 1.25rem;
    border-left: 2px solid var(--signal);
    background: var(--paper-raised);
  }

  .note p {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .note-warning {
    border-left-color: var(--danger);
  }
</style>
