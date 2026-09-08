<script lang="ts">
  import type { PageProps } from './$types';
  import { formatCount, formatProductLabel } from '../../dashboard/dashboard-view';

  let { data }: PageProps = $props();
</script>

<svelte:head
  ><title>Revenue - OMG Admin</title><meta name="robots" content="noindex, nofollow" /></svelte:head
>

<main id="main-content" class="workspace">
  <header class="page-header">
    <p>Revenue / reconciled invoices</p>
    <h1>Revenue intelligence</h1>
    <span>Paid Stripe invoice aggregates stored by the licensing service.</span>
  </header>
  <section class="metric-grid" aria-label="Revenue summary">
    <article>
      <span>Monthly recurring revenue</span><strong>${formatCount(data.revenue.mrr)}</strong>
    </article>
    <article><span>Annual run rate</span><strong>${formatCount(data.revenue.arr)}</strong></article>
  </section>

  <section class="panel" aria-labelledby="monthly-title">
    <header>
      <h2 id="monthly-title">Monthly revenue</h2>
      <span>Paid invoices</span>
    </header>
    {#if data.revenue.monthly.length === 0}<p class="empty">
        No paid revenue has been recorded.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead><tr><th>Month</th><th>Revenue</th><th>Transactions</th></tr></thead><tbody
            >{#each data.revenue.monthly as month (month.month)}<tr
                ><td>{month.month}</td><td>${formatCount(month.revenue)}</td><td
                  >{formatCount(month.transactions)}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>

  <section class="panel" aria-labelledby="tier-title">
    <header>
      <h2 id="tier-title">Revenue by tier</h2>
      <span>Current retained history</span>
    </header>
    {#if data.revenue.byTier.length === 0}<p class="empty">
        No tier revenue has been recorded.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead><tr><th>Tier</th><th>Revenue</th><th>Customers</th></tr></thead><tbody
            >{#each data.revenue.byTier as tier (tier.tier)}<tr
                ><td>{formatProductLabel(tier.tier)}</td><td>${formatCount(tier.totalRevenue)}</td
                ><td>{formatCount(tier.customers)}</td></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>

  <aside>
    <strong>Interpretation note</strong>
    <p>
      ARR is the current MRR multiplied by twelve. It is a run-rate projection, not a forecast. Tax
      is not included because Stripe Tax remains disabled.
    </p>
  </aside>
</main>

<style>
  .workspace {
    width: min(calc(100% - clamp(2rem, 4vw, 5rem)), 72rem);
    margin-inline: auto;
    padding-block: clamp(2rem, 4vw, 4rem) 6rem;
  }
  .page-header p,
  .page-header span,
  header span,
  th {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
  }
  .page-header h1 {
    max-width: 12ch;
    margin: 0.55rem 0 0.8rem;
    font-family: var(--font-display);
    font-size: clamp(2.6rem, 6vw, 5.5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 2rem;
    border: 1px solid var(--rule-strong);
  }
  .metric-grid article {
    padding: clamp(1rem, 3vw, 2rem);
    border-right: 1px solid var(--rule);
  }
  .metric-grid span {
    color: var(--ink-muted);
    font-size: 0.68rem;
  }
  .metric-grid strong {
    display: block;
    margin-top: 0.5rem;
    font-family: var(--font-mono);
    font-size: clamp(1.6rem, 4vw, 3rem);
  }
  .panel {
    margin-top: 1rem;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }
  .panel > header {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    justify-content: space-between;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--rule-strong);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.15rem;
    letter-spacing: -0.04em;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th,
  td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--rule);
  }
  td {
    font-size: 0.78rem;
  }
  .empty {
    margin: 0;
    padding: 1.3rem 1.2rem;
    color: var(--ink-muted);
    font-size: 0.78rem;
  }
  aside {
    margin-top: 1rem;
    padding: 1rem 1.2rem;
    border: 1px solid var(--rule);
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  aside strong {
    color: var(--ink);
  }
  aside p {
    max-width: 72ch;
    margin: 0.45rem 0 0;
  }
  @media (max-width: 38rem) {
    .metric-grid {
      grid-template-columns: 1fr;
    }
    .metric-grid article {
      border-right: 0;
      border-bottom: 1px solid var(--rule);
    }
  }
</style>
