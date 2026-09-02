<script lang="ts">
  import type { PageProps } from './$types';
  import { formatCount, formatProductLabel } from '../../dashboard/dashboard-view';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Analytics - OMG Admin</title>
  <meta name="description" content="Private OMG product and site analytics." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="workspace">
  <header class="page-header">
    <div>
      <p>Analytics / {data.days} days</p>
      <h1>Product and site activity</h1>
      <span>Grounded Worker aggregates. No client-side tracking identifiers are exposed.</span>
    </div>
    <nav aria-label="Analytics period">
      {#each [7, 30, 90] as days}
        <a href={`?days=${days}`} aria-current={data.days === days ? 'page' : undefined}>{days}d</a>
      {/each}
    </nav>
  </header>

  <section class="metric-grid" aria-label="Site summary">
    <article>
      <span>Pageviews</span><strong
        >{formatCount(data.analytics.site.summary.total_pageviews)}</strong
      >
    </article>
    <article>
      <span>Visitors</span><strong>{formatCount(data.analytics.site.summary.total_visitors)}</strong
      >
    </article>
    <article>
      <span>Sessions</span><strong>{formatCount(data.analytics.site.summary.total_sessions)}</strong
      >
    </article>
    <article>
      <span>Countries</span><strong>{formatCount(data.analytics.geo.total_countries)}</strong>
    </article>
    <article>
      <span>New users / 7d</span><strong
        >{formatCount(data.analytics.product.growth.new_users_7d)}</strong
      >
    </article>
    <article>
      <span>Paid conversions / 7d</span><strong
        >{formatCount(data.analytics.product.growth.new_paid_7d)}</strong
      >
    </article>
    <article>
      <span>At risk</span><strong
        >{formatCount(data.analytics.product.churn_risk.at_risk_users)}</strong
      >
    </article>
    <article>
      <span>Retention</span><strong>{data.analytics.product.retention_rate.toFixed(1)}%</strong>
    </article>
  </section>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="funnel-title">
      <header>
        <h2 id="funnel-title">Activation funnel</h2>
        <span>Product telemetry</span>
      </header>
      <dl>
        <div>
          <dt>Installed</dt>
          <dd>{formatCount(data.analytics.product.funnel.installs)}</dd>
        </div>
        <div>
          <dt>Activated</dt>
          <dd>{formatCount(data.analytics.product.funnel.activated)}</dd>
        </div>
        <div>
          <dt>Power users</dt>
          <dd>{formatCount(data.analytics.product.funnel.power_users)}</dd>
        </div>
        <div>
          <dt>Time saved</dt>
          <dd>{formatCount(data.analytics.product.time_saved.total_hours)} h</dd>
        </div>
      </dl>
    </section>

    <section class="panel" aria-labelledby="performance-title">
      <header>
        <h2 id="performance-title">Command performance</h2>
        <span>Recorded queries</span>
      </header>
      <dl>
        <div>
          <dt>Average</dt>
          <dd>{formatCount(data.analytics.product.performance.avg_latency_ms)} ms</dd>
        </div>
        <div>
          <dt>Minimum</dt>
          <dd>{formatCount(data.analytics.product.performance.min_ms)} ms</dd>
        </div>
        <div>
          <dt>Maximum</dt>
          <dd>{formatCount(data.analytics.product.performance.max_ms)} ms</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{formatCount(data.analytics.product.performance.query_count)}</dd>
        </div>
      </dl>
    </section>
  </div>

  <section class="panel" aria-labelledby="trend-title">
    <header>
      <h2 id="trend-title">Daily site trend</h2>
      <span>{data.days}-day window</span>
    </header>
    {#if data.analytics.site.daily_trend.length === 0}
      <p class="empty">No site activity was recorded in this period.</p>
    {:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Pageviews</th><th>Visitors</th></tr></thead><tbody>
            {#each data.analytics.site.daily_trend as day (day.date)}
              <tr
                ><td>{day.date}</td><td>{formatCount(day.pageviews)}</td><td
                  >{formatCount(day.visitors)}</td
                ></tr
              >
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="pages-title">
      <header>
        <h2 id="pages-title">Top pages</h2>
        <span>Site analytics</span>
      </header>
      {#if data.analytics.site.top_pages.length === 0}<p class="empty">
          No page data recorded.
        </p>{:else}
        <ol class="ranked">
          {#each data.analytics.site.top_pages as page (page.path)}<li>
              <strong>{page.path}</strong><span
                >{formatCount(page.views)} views / {formatCount(page.visitors)} visitors</span
              >
            </li>{/each}
        </ol>
      {/if}
    </section>
    <section class="panel" aria-labelledby="geo-title">
      <header>
        <h2 id="geo-title">Geographic activity</h2>
        <span>Site + docs + CLI</span>
      </header>
      {#if data.analytics.geo.geo_distribution.length === 0}<p class="empty">
          No geographic data recorded.
        </p>{:else}
        <ol class="ranked">
          {#each data.analytics.geo.geo_distribution as country (country.country_code)}<li>
              <strong>{country.country_code}</strong><span
                >{formatCount(country.user_count)} weighted events / {country.percentage.toFixed(
                  1
                )}%</span
              >
            </li>{/each}
        </ol>
      {/if}
    </section>
  </div>

  <section class="panel" aria-labelledby="cohort-title">
    <header>
      <h2 id="cohort-title">Retention cohorts</h2>
      <span>Monthly activity cells</span>
    </header>
    {#if data.analytics.cohorts.length === 0}<p class="empty">No cohort data recorded.</p>{:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Cohort</th><th>Month index</th><th>Active users</th></tr></thead><tbody>
            {#each data.analytics.cohorts as cohort (`${cohort.cohortMonth}:${cohort.monthIndex}`)}<tr
                ><td>{cohort.cohortMonth}</td><td>{formatCount(cohort.monthIndex)}</td><td
                  >{formatCount(cohort.activeUsers)}</td
                ></tr
              >{/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="panel" aria-labelledby="docs-title">
    <header>
      <h2 id="docs-title">Documentation analytics</h2>
      <span>{formatCount(data.analytics.docs.summary.period_days)}-day retained window</span>
    </header>
    <dl>
      <div>
        <dt>Pageviews</dt>
        <dd>{formatCount(data.analytics.docs.summary.total_pageviews)}</dd>
      </div>
      <div>
        <dt>Sessions</dt>
        <dd>{formatCount(data.analytics.docs.summary.total_sessions)}</dd>
      </div>
      <div>
        <dt>Pages / session</dt>
        <dd>{data.analytics.docs.summary.avg_pages_per_session}</dd>
      </div>
    </dl>
    {#if data.analytics.docs.top_pages.length > 0}<div class="table-scroll">
        <table>
          <thead
            ><tr><th>Top page</th><th>Views</th><th>Sessions</th><th>Average time</th></tr></thead
          ><tbody
            >{#each data.analytics.docs.top_pages as page, index (`${page.path}:${index}`)}<tr
                ><td>{page.path ?? 'Unknown page'}</td><td>{formatCount(page.views)}</td><td
                  >{formatCount(page.sessions)}</td
                ><td>{formatCount(page.avg_time)} ms</td></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="docs-referrers-title">
      <header>
        <h2 id="docs-referrers-title">Docs referrers</h2>
        <span>Top sources</span>
      </header>
      {#if data.analytics.docs.top_referrers.length === 0}<p class="empty">
          No referrer data recorded.
        </p>{:else}<ol class="ranked">
          {#each data.analytics.docs.top_referrers as item, index (`${item.referrer}:${index}`)}<li>
              <strong>{item.referrer ?? 'Direct / unknown'}</strong><span
                >{formatCount(item.sessions)} sessions / {formatCount(item.pageviews)} views</span
              >
            </li>{/each}
        </ol>{/if}
    </section>
    <section class="panel" aria-labelledby="docs-interactions-title">
      <header>
        <h2 id="docs-interactions-title">Docs interactions</h2>
        <span>Recorded targets</span>
      </header>
      {#if data.analytics.docs.top_interactions.length === 0}<p class="empty">
          No interaction data recorded.
        </p>{:else}<ol class="ranked">
          {#each data.analytics.docs.top_interactions as item, index (`${item.interaction_type}:${item.target}:${index}`)}<li
            >
              <strong>{formatProductLabel(item.interaction_type ?? 'unknown')}</strong><span
                >{item.target ?? 'Unknown target'} / {formatCount(item.count)}</span
              >
            </li>{/each}
        </ol>{/if}
    </section>
  </div>

  <div class="panel-grid">
    <section class="panel" aria-labelledby="docs-trend-title">
      <header>
        <h2 id="docs-trend-title">Docs trend</h2>
        <span>Daily sessions</span>
      </header>
      {#if data.analytics.docs.pageviews_over_time.length === 0}<p class="empty">
          No documentation trend recorded.
        </p>{:else}<ol class="ranked">
          {#each data.analytics.docs.pageviews_over_time as item, index (`${item.date}:${index}`)}<li
            >
              <strong>{item.date ?? 'Unknown date'}</strong><span
                >{formatCount(item.views)} views / {formatCount(item.sessions)} sessions</span
              >
            </li>{/each}
        </ol>{/if}
    </section>
    <section class="panel" aria-labelledby="docs-geo-title">
      <header>
        <h2 id="docs-geo-title">Docs geography</h2>
        <span>Session locations</span>
      </header>
      {#if data.analytics.docs.geographic.length === 0}<p class="empty">
          No documentation geography recorded.
        </p>{:else}<ol class="ranked">
          {#each data.analytics.docs.geographic as item (item.country_code)}<li>
              <strong>{item.country_code}</strong><span
                >{formatCount(item.sessions)} sessions / {formatCount(item.pageviews)} views</span
              >
            </li>{/each}
        </ol>{/if}
    </section>
  </div>

  <section class="panel" aria-labelledby="docs-campaign-title">
    <header>
      <h2 id="docs-campaign-title">Documentation campaigns</h2>
      <span>UTM attribution</span>
    </header>
    {#if data.analytics.docs.utm_campaigns.length === 0}<p class="empty">
        No campaign attribution recorded.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead
            ><tr
              ><th>Source</th><th>Medium</th><th>Campaign</th><th>Sessions</th><th>Pageviews</th
              ></tr
            ></thead
          ><tbody
            >{#each data.analytics.docs.utm_campaigns as item, index (`${item.utm_source}:${item.utm_campaign}:${index}`)}<tr
                ><td>{item.utm_source ?? 'Unknown'}</td><td>{item.utm_medium ?? 'Unknown'}</td><td
                  >{item.utm_campaign ?? 'Unknown'}</td
                ><td>{formatCount(item.sessions)}</td><td>{formatCount(item.pageviews)}</td></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>

  <section class="panel" aria-labelledby="docs-performance-title">
    <header>
      <h2 id="docs-performance-title">Documentation performance</h2>
      <span>Recorded browser samples</span>
    </header>
    {#if data.analytics.docs.performance.length === 0}<p class="empty">
        No documentation performance samples.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead><tr><th>Path</th><th>Average load</th><th>P95 load</th><th>Samples</th></tr></thead
          ><tbody
            >{#each data.analytics.docs.performance as item, index (`${item.path}:${index}`)}<tr
                ><td>{item.path ?? 'Unknown path'}</td><td>{formatCount(item.avg_load)} ms</td><td
                  >{formatCount(item.p95_load)} ms</td
                ><td>{formatCount(item.samples)}</td></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>

  <section class="panel" aria-labelledby="runtime-title">
    <header>
      <h2 id="runtime-title">Runtime usage</h2>
      <span>Grounded commands and machines</span>
    </header>
    {#if data.analytics.product.runtime_usage.length === 0}<p class="empty">
        No runtime usage recorded.
      </p>{:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Runtime</th><th>Commands</th><th>Machines</th></tr></thead><tbody>
            {#each data.analytics.product.runtime_usage as runtime, index (`${runtime.runtime}:${index}`)}<tr
                ><td>{formatProductLabel(runtime.runtime ?? 'unknown')}</td><td
                  >{formatCount(runtime.count)}</td
                ><td>{formatCount(runtime.machines)}</td></tr
              >{/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</main>

<style>
  .workspace {
    width: min(calc(100% - clamp(2rem, 4vw, 5rem)), 96rem);
    margin-inline: auto;
    padding-block: clamp(2rem, 4vw, 4rem) 6rem;
  }
  .page-header {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    align-items: end;
    justify-content: space-between;
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
  h1 {
    max-width: 14ch;
    margin: 0.55rem 0 0.8rem;
    font-family: var(--font-display);
    font-size: clamp(2.6rem, 6vw, 5.5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
  }
  .page-header nav {
    display: flex;
    border: 1px solid var(--rule-strong);
  }
  .page-header nav a {
    padding: 0.65rem 0.85rem;
    border-right: 1px solid var(--rule);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-decoration: none;
  }
  .page-header nav a:last-child {
    border-right: 0;
  }
  .page-header nav a[aria-current='page'] {
    background: var(--signal);
    color: var(--signal-ink);
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    margin-top: 2rem;
    border: 1px solid var(--rule-strong);
  }
  .metric-grid article {
    min-width: 0;
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
    font-size: 1.35rem;
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
  .ranked {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ranked li {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.8rem 1.2rem;
    border-bottom: 1px solid var(--rule);
    font-size: 0.76rem;
  }
  .ranked span {
    color: var(--ink-muted);
    text-align: right;
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
