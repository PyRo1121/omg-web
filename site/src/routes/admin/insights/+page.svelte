<script lang="ts">
  import type { PageProps } from './$types';
  import { formatCount, formatProductLabel } from '../../dashboard/dashboard-view';

  let { data }: PageProps = $props();
</script>

<svelte:head
  ><title>Insights - OMG Admin</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>

<main id="main-content" class="workspace">
  <header class="page-header">
    <p>Insights / grounded signals</p>
    <h1>Adoption and account risk</h1>
    <span
      >Every value comes from retained Worker aggregates. Missing inputs remain unavailable.</span
    >
  </header>

  <section class="metric-grid" aria-label="Engagement summary">
    <article><span>DAU</span><strong>{formatCount(data.insights.engagement.dau)}</strong></article>
    <article><span>WAU</span><strong>{formatCount(data.insights.engagement.wau)}</strong></article>
    <article><span>MAU</span><strong>{formatCount(data.insights.engagement.mau)}</strong></article>
    <article>
      <span>Daily stickiness</span><strong
        >{data.insights.engagement.stickiness.daily_to_monthly}</strong
      >
    </article>
    <article>
      <span>Weekly stickiness</span><strong
        >{data.insights.engagement.stickiness.weekly_to_monthly}</strong
      >
    </article>
    <article>
      <span>Current MRR</span><strong>${formatCount(data.insights.revenue.current_mrr)}</strong>
    </article>
    <article>
      <span>Projected ARR</span><strong>${formatCount(data.insights.revenue.projected_arr)}</strong>
    </article>
  </section>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="adoption-title">
      <header>
        <h2 id="adoption-title">Feature adoption</h2>
        <span>Recorded activity</span>
      </header>
      <dl>
        <div>
          <dt>Installs</dt>
          <dd>{formatCount(data.insights.featureAdoption.total_installs)}</dd>
        </div>
        <div>
          <dt>Searches</dt>
          <dd>{formatCount(data.insights.featureAdoption.total_searches)}</dd>
        </div>
        <div>
          <dt>Runtime switches</dt>
          <dd>{formatCount(data.insights.featureAdoption.total_runtime_switches)}</dd>
        </div>
        <div>
          <dt>SBOMs</dt>
          <dd>{formatCount(data.insights.featureAdoption.total_sbom)}</dd>
        </div>
        <div>
          <dt>Vulnerabilities</dt>
          <dd>{formatCount(data.insights.featureAdoption.total_vulns)}</dd>
        </div>
        <div>
          <dt>Active users</dt>
          <dd>{formatCount(data.insights.featureAdoption.total_active_users)}</dd>
        </div>
        <div>
          <dt>Install adopters</dt>
          <dd>{formatCount(data.insights.featureAdoption.install_adopters)}</dd>
        </div>
        <div>
          <dt>Search adopters</dt>
          <dd>{formatCount(data.insights.featureAdoption.search_adopters)}</dd>
        </div>
        <div>
          <dt>Runtime adopters</dt>
          <dd>{formatCount(data.insights.featureAdoption.runtime_adopters)}</dd>
        </div>
        <div>
          <dt>SBOM adopters</dt>
          <dd>{formatCount(data.insights.featureAdoption.sbom_adopters)}</dd>
        </div>
      </dl>
    </section>
    <section class="panel" aria-labelledby="ttv-title">
      <header>
        <h2 id="ttv-title">Time to value</h2>
        <span>90-day cohort</span>
      </header>
      <dl>
        <div>
          <dt>Average activation</dt>
          <dd>
            {data.insights.timeToValue.avg_days_to_activation === null
              ? 'Unavailable'
              : `${data.insights.timeToValue.avg_days_to_activation.toFixed(1)} days`}
          </dd>
        </div>
        <div>
          <dt>Activated in week one</dt>
          <dd>
            {data.insights.timeToValue.pct_activated_week1 === null
              ? 'Unavailable'
              : `${data.insights.timeToValue.pct_activated_week1.toFixed(1)}%`}
          </dd>
        </div>
        <div>
          <dt>Expansion MRR / 12m</dt>
          <dd>${formatCount(data.insights.revenue.expansion_mrr_12m)}</dd>
        </div>
      </dl>
    </section>
  </div>

  <section class="panel" aria-labelledby="expansion-title">
    <header>
      <h2 id="expansion-title">Expansion opportunities</h2>
      <span>Server-projected customer references</span>
    </header>
    {#if data.insights.expansionOpportunities.length === 0}<p class="empty">
        No grounded expansion opportunities.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead
            ><tr
              ><th>Customer</th><th>Tier</th><th>Signal</th><th>Priority</th><th>Machines</th><th
                >30d commands</th
              ></tr
            ></thead
          ><tbody>
            {#each data.insights.expansionOpportunities as item (item.email)}<tr
                ><td>{item.email}</td><td>{formatProductLabel(item.tier)}</td><td
                  >{formatProductLabel(item.opportunityType)}</td
                ><td>{formatProductLabel(item.priority)}</td><td
                  >{formatCount(item.activeMachines)}</td
                ><td>{formatCount(item.commands30d)}</td></tr
              >{/each}
          </tbody>
        </table>
      </div>{/if}
  </section>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="risk-title">
      <header>
        <h2 id="risk-title">Churn risk</h2>
        <span>Active licenses</span>
      </header>
      {#if data.insights.churnRisk.length === 0}<p class="empty">
          No churn-risk segments.
        </p>{:else}<ul>
          {#each data.insights.churnRisk as item, index (`${item.risk_segment}:${item.tier}:${index}`)}<li
            >
              <strong>{formatProductLabel(item.risk_segment)}</strong><span
                >{formatCount(item.user_count)} / {formatProductLabel(item.tier ?? 'unknown')}</span
              >
            </li>{/each}
        </ul>{/if}
    </section>
    <section class="panel" aria-labelledby="runtime-title">
      <header>
        <h2 id="runtime-title">Runtime adoption</h2>
        <span>Distinct users</span>
      </header>
      {#if data.insights.runtimeAdoption.length === 0}<p class="empty">
          No runtime adoption data.
        </p>{:else}<ul>
          {#each data.insights.runtimeAdoption as item (item.runtime)}<li>
              <strong>{formatProductLabel(item.runtime)}</strong><span
                >{formatCount(item.uniqueUsers)} users / {formatCount(item.totalUses)} uses</span
              >
            </li>{/each}
        </ul>{/if}
    </section>
  </div>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="retention-title">
      <header>
        <h2 id="retention-title">Weekly retention</h2>
        <span>Cohort cells</span>
      </header>
      {#if data.insights.retention.length === 0}<p class="empty">
          No retention cohort data.
        </p>{:else}<ul>
          {#each data.insights.retention as item (`${item.cohortDate}:${item.weekNumber}`)}<li>
              <strong>{item.cohortDate} / week {formatCount(item.weekNumber)}</strong><span
                >{formatCount(item.retainedUsers)} retained</span
              >
            </li>{/each}
        </ul>{/if}
    </section>
    <section class="panel" aria-labelledby="heatmap-title">
      <header>
        <h2 id="heatmap-title">Command timing</h2>
        <span>UTC weekday and hour</span>
      </header>
      {#if data.insights.commandHeatmap.length === 0}<p class="empty">
          No command timing data.
        </p>{:else}<ul>
          {#each data.insights.commandHeatmap as item, index (`${item.day_of_week}:${item.hour}:${index}`)}<li
            >
              <strong>Day {item.day_of_week ?? 'unknown'} / {item.hour ?? 'unknown'}:00</strong
              ><span>{formatCount(item.event_count)} events</span>
            </li>{/each}
        </ul>{/if}
    </section>
  </div>

  <section class="panel" aria-labelledby="ltv-title">
    <header>
      <h2 id="ltv-title">Lifetime value by tier</h2>
      <span>Stored revenue</span>
    </header>
    {#if data.insights.ltvByTier.length === 0}<p class="empty">
        No lifetime-value data.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead><tr><th>Tier</th><th>Customers</th><th>Average LTV</th></tr></thead><tbody
            >{#each data.insights.ltvByTier as item (item.tier)}<tr
                ><td>{formatProductLabel(item.tier)}</td><td>{formatCount(item.customerCount)}</td
                ><td>${formatCount(item.averageLtv)}</td></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>
</main>

<style>
  .workspace {
    width: min(calc(100% - clamp(2rem, 4vw, 5rem)), 96rem);
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
    max-width: 14ch;
    margin: 0.55rem 0 0.8rem;
    font-family: var(--font-display);
    font-size: clamp(2.6rem, 6vw, 5.5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    margin-top: 2rem;
    border: 1px solid var(--rule-strong);
  }
  .metric-grid article {
    padding: 1rem;
    border-right: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
  }
  .metric-grid span,
  dt {
    color: var(--ink-muted);
    font-size: 0.68rem;
  }
  .metric-grid strong {
    display: block;
    margin-top: 0.35rem;
    font-family: var(--font-mono);
    font-size: 1.3rem;
  }
  .panel-grid {
    display: grid;
    gap: 1rem;
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
  dl {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    margin: 0;
  }
  dl div {
    padding: 1rem 1.2rem;
    border-right: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
  }
  dt,
  dd {
    margin: 0;
  }
  dd {
    margin-top: 0.25rem;
    font-family: var(--font-mono);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.8rem 1.2rem;
    border-bottom: 1px solid var(--rule);
    font-size: 0.76rem;
  }
  li span {
    color: var(--ink-muted);
    text-align: right;
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
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--rule);
  }
  td {
    font-size: 0.76rem;
  }
  .empty {
    margin: 0;
    padding: 1.3rem 1.2rem;
    color: var(--ink-muted);
    font-size: 0.78rem;
  }
  @media (min-width: 52rem) {
    .panel-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
