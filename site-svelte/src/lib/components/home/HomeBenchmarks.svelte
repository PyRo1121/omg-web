<script lang="ts">
  const benchmarks = [
    { operation: 'Package search', omg: '6 ms', baseline: 'vs 133 ms' },
    { operation: 'Package info', omg: '6.5 ms', baseline: 'vs 138 ms' },
    { operation: 'Explicit packages', omg: '2 ms', baseline: 'vs 601 ms' },
  ] as const;
</script>

<section
  id="benchmarks"
  class="benchmarks home-shell home-section"
  aria-labelledby="benchmark-title"
>
  <header class="benchmark-copy">
    <h2 id="benchmark-title" class="home-section-title">Speed you do not wait for.</h2>
    <p class="home-section-intro">
      Real command latency, measured on an Intel i9-14900K. Lower is better.
    </p>
  </header>

  <div class="benchmark-panel">
    <div class="benchmark-lead">
      <p>Package search</p>
      <p>
        <strong>22×</strong>
        <span>faster than pacman</span>
      </p>
    </div>
    <dl>
      {#each benchmarks as benchmark (benchmark.operation)}
        <div>
          <dt>{benchmark.operation}</dt>
          <dd><code>{benchmark.omg}</code><span>{benchmark.baseline}</span></dd>
        </div>
      {/each}
    </dl>
  </div>
</section>

<style>
  .benchmarks {
    display: grid;
    gap: clamp(3rem, 7vw, 6rem);
  }

  .benchmark-copy {
    max-width: 42rem;
  }

  .benchmark-panel {
    background: var(--paper-raised);
  }

  .benchmark-lead {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 1rem;
    padding: clamp(2rem, 6vw, 4rem) clamp(1.5rem, 5vw, 3.5rem) 2.5rem;
  }

  .benchmark-lead > p:first-child {
    font-size: 1.05rem;
    font-weight: 550;
  }

  .benchmark-lead > p:last-child {
    text-align: right;
  }

  .benchmark-lead strong,
  .benchmark-lead span {
    display: block;
  }

  .benchmark-lead strong {
    color: var(--signal);
    font-size: clamp(5rem, 12vw, 9rem);
    font-weight: 650;
    letter-spacing: -0.1em;
    line-height: 0.7;
  }

  .benchmark-lead span {
    margin-top: 1.25rem;
    color: var(--ink-muted);
    font-size: 0.8rem;
  }

  .benchmark-panel dl {
    margin: 0;
    padding: 0 clamp(1.5rem, 5vw, 3.5rem) 2rem;
  }

  .benchmark-panel dl div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 1rem;
    border-top: 1px solid var(--rule);
  }

  .benchmark-panel dt,
  .benchmark-panel dd {
    font-size: 0.83rem;
  }

  .benchmark-panel dt,
  .benchmark-panel dd span {
    color: var(--ink-muted);
  }

  .benchmark-panel dd {
    display: flex;
    gap: 0.8rem;
    margin: 0;
    text-align: right;
  }

  @media (max-width: 47.99rem) {
    .benchmark-lead {
      grid-template-columns: 1fr;
    }

    .benchmark-lead > p:last-child {
      text-align: left;
    }

    .benchmark-panel dl div,
    .benchmark-panel dd {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
