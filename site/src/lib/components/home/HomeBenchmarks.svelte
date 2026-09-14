<script lang="ts"></script>

<section
  id="benchmarks"
  class="benchmarks home-shell home-section"
  aria-labelledby="benchmark-title"
>
  <header>
    <p class="section-label">Measured, not promised</p>
    <h2 id="benchmark-title">Fast, with receipts.</h2>
    <p class="benchmark-intro">
      Search a local package index without waiting on a fresh process to do all the work. Here is
      one recorded run, not a guarantee for every machine.
    </p>
  </header>
  <div class="benchmark-results">
    <p class="benchmark-highlight">
      <strong>13.1<span>ms</span></strong> <span>Package search / OMG daemon</span>
    </p>
    <table>
      <caption>Arch Linux benchmark · September 3, 2026 · mean duration</caption>
      <thead
        ><tr
          ><th scope="col">Operation</th><th scope="col">OMG daemon</th><th scope="col">pacman</th
          ></tr
        ></thead
      >
      <tbody>
        <tr><th scope="row">Package search</th><td>13.1 ms</td><td>247 ms</td></tr>
        <tr><th scope="row">Package info</th><td>26.4 ms</td><td>226 ms</td></tr>
        <tr><th scope="row">Explicit package count</th><td>10.4 ms</td><td>32 ms</td></tr>
      </tbody>
    </table>
    <p class="benchmark-method">
      Intel Core i9-14900K, 31 GiB RAM, local pacman databases. Hyperfine 1.20, three warmups, 20–50
      runs.
    </p>
    <a
      class="text-link"
      href="https://github.com/PyRo1121/omg/tree/fe72b92b6e61c13a19f00627d22f3d1bc5713347/benchmarks/records/20260903_015949-5c43ddcc"
      >Inspect the benchmark record <span aria-hidden="true">↗</span></a
    >
  </div>
</section>

<style>
  .benchmarks {
    display: grid;
    gap: 3rem;
    border-top: 1px solid var(--rule);
  }
  .section-label {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
  h2 {
    max-width: 12ch;
    margin-block: 1.5rem;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 5.7vw, 5.5rem);
    letter-spacing: -0.06em;
    font-weight: 550;
    line-height: 1;
  }
  .benchmark-intro {
    max-width: 35ch;
    color: var(--ink-muted);
    line-height: 1.7;
  }
  .benchmark-results {
    min-width: 0;
  }
  .benchmark-highlight {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 2.5rem;
  }
  .benchmark-highlight strong {
    color: var(--signal);
    font-family: var(--font-display);
    font-size: clamp(4rem, 9vw, 7rem);
    font-weight: 550;
    letter-spacing: -0.07em;
    line-height: 1;
  }
  .benchmark-highlight strong span {
    margin-left: 0.25em;
    font-size: 0.4em;
  }
  .benchmark-highlight > span,
  caption,
  .benchmark-method {
    color: var(--ink-muted);
    font-size: 0.75rem;
    line-height: 1.7;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: clamp(0.75rem, 1.2vw, 0.875rem);
  }
  caption {
    text-align: left;
    padding-bottom: 0.75rem;
  }
  th,
  td {
    padding: 1rem 0.5rem;
    border-top: 1px solid var(--rule);
    text-align: right;
    font-weight: 400;
  }
  th:first-child {
    padding-left: 0;
    text-align: left;
  }
  td {
    font-family: var(--font-mono);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  thead th {
    color: var(--ink-muted);
  }
  .benchmark-method {
    margin-block: 1rem;
    max-width: 58ch;
  }
  .text-link {
    justify-content: flex-start;
  }
  @media (min-width: 60rem) {
    .benchmarks {
      grid-template-columns: 1fr 1.15fr;
      gap: 5rem;
    }
  }
</style>
