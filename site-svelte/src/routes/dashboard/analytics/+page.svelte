<script lang="ts">
  import type { PageProps } from './$types';
  import { formatCount, formatDuration, streakLabel } from '../dashboard-view';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Account analytics - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel analytics-panel" aria-labelledby="analytics-title">
    <nav class="workspace-nav" aria-label="Account workspace">
      <a href="/dashboard/">Overview</a>
      <a href="/dashboard/analytics/" aria-current="page">Analytics</a>
    </nav>

    <p class="page-kicker">Account / Analytics</p>
    <h1 id="analytics-title" class="account-title">Account analytics.</h1>

    {#if data.analytics.status === 'verification-required'}
      <p class="analytics-state">Verify your email to access usage analytics.</p>
    {:else if data.analytics.status === 'unavailable'}
      <p class="analytics-state" role="status">Analytics are temporarily unavailable.</p>
    {:else}
      <div class="export-links" aria-label="Usage exports">
        <a href="/dashboard/analytics/export/csv">Download CSV</a>
        <a href="/dashboard/analytics/export/json">Download JSON</a>
      </div>

      <dl class="metric-grid">
        <div>
          <dt>Commands</dt>
          <dd>{formatCount(data.analytics.analytics.totals.commands)}</dd>
        </div>
        <div>
          <dt>Packages installed</dt>
          <dd>{formatCount(data.analytics.analytics.totals.packagesInstalled)}</dd>
        </div>
        <div>
          <dt>Packages searched</dt>
          <dd>{formatCount(data.analytics.analytics.totals.packagesSearched)}</dd>
        </div>
        <div>
          <dt>Runtime switches</dt>
          <dd>{formatCount(data.analytics.analytics.totals.runtimeSwitches)}</dd>
        </div>
        <div>
          <dt>SBOMs generated</dt>
          <dd>{formatCount(data.analytics.analytics.totals.sbomsGenerated)}</dd>
        </div>
        <div>
          <dt>Vulnerabilities found</dt>
          <dd>{formatCount(data.analytics.analytics.totals.vulnerabilitiesFound)}</dd>
        </div>
        <div>
          <dt>Time saved</dt>
          <dd>{formatDuration(data.analytics.analytics.totals.timeSavedMs)}</dd>
        </div>
        <div>
          <dt>Current streak</dt>
          <dd>{streakLabel(data.analytics.analytics.streaks.current)}</dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{streakLabel(data.analytics.analytics.streaks.longest)}</dd>
        </div>
      </dl>

      <section class="analytics-section" aria-labelledby="dimensions-title">
        <h2 id="dimensions-title">Usage dimensions</h2>
        <dl class="metric-grid compact-grid">
          <div>
            <dt>Top package</dt>
            <dd>{data.analytics.analytics.dimensions.topPackage ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Top runtime</dt>
            <dd>{data.analytics.analytics.dimensions.topRuntime ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Usage percentile</dt>
            <dd>
              {data.analytics.analytics.dimensions.percentile === null
                ? 'Unavailable'
                : `Percentile ${data.analytics.analytics.dimensions.percentile}`}
            </dd>
          </div>
        </dl>
      </section>

      <section class="analytics-section" aria-labelledby="breakdown-title">
        <h2 id="breakdown-title">Command breakdown</h2>
        <dl class="metric-grid compact-grid">
          <div>
            <dt>Installed</dt>
            <dd>{formatCount(data.analytics.analytics.breakdown.installed)}</dd>
          </div>
          <div>
            <dt>Searched</dt>
            <dd>{formatCount(data.analytics.analytics.breakdown.searched)}</dd>
          </div>
          <div>
            <dt>Switched</dt>
            <dd>{formatCount(data.analytics.analytics.breakdown.switched)}</dd>
          </div>
          <div>
            <dt>SBOM</dt>
            <dd>{formatCount(data.analytics.analytics.breakdown.sbom)}</dd>
          </div>
          <div>
            <dt>Vulnerabilities</dt>
            <dd>{formatCount(data.analytics.analytics.breakdown.vulnerabilities)}</dd>
          </div>
        </dl>
      </section>

      <section class="analytics-section" aria-labelledby="daily-title">
        <h2 id="daily-title">Daily activity</h2>
        {#if data.analytics.analytics.daily.length === 0}
          <p class="analytics-state">No daily activity has been reported yet.</p>
        {:else}
          <div class="table-scroll" role="region" aria-label="Daily account usage">
            <table>
              <thead
                ><tr
                  ><th scope="col">Date</th><th scope="col">Commands</th><th scope="col"
                    >Time saved</th
                  ></tr
                ></thead
              >
              <tbody>
                {#each data.analytics.analytics.daily as day (day.date)}
                  <tr
                    ><th scope="row">{day.date}</th><td>{formatCount(day.commands)}</td><td
                      >{formatDuration(day.timeSavedMs)}</td
                    ></tr
                  >
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}
  </section>
</main>

<style>
  .analytics-panel {
    max-width: 64rem;
  }
  .workspace-nav {
    display: flex;
    gap: 1.25rem;
    margin-bottom: 2.5rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
  .workspace-nav a {
    color: var(--ink-muted);
    text-decoration: none;
  }
  .workspace-nav a:hover,
  .workspace-nav a[aria-current='page'] {
    color: var(--signal);
  }
  .export-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 2rem;
  }
  .export-links a {
    padding: 0.75rem 1rem;
    border: 1px solid var(--rule-strong);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-decoration: none;
  }
  .export-links a:hover {
    border-color: var(--signal);
    color: var(--signal);
  }
  .metric-grid {
    display: grid;
    gap: 1px;
    margin: 2rem 0 0;
    background: var(--rule);
    border: 1px solid var(--rule);
  }
  .metric-grid > div {
    min-width: 0;
    padding: 1.25rem;
    background: var(--paper);
  }
  .metric-grid dt {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  .metric-grid dd {
    margin: 0.5rem 0 0;
    font-family: var(--font-mono);
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
  .analytics-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }
  .analytics-section h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: -0.04em;
  }
  .analytics-state {
    margin-top: 1.5rem;
    color: var(--ink-muted);
  }
  .table-scroll {
    margin-top: 1.5rem;
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    padding: 0.9rem;
    border-bottom: 1px solid var(--rule);
    text-align: left;
  }
  th {
    color: var(--ink-muted);
    font-weight: 500;
  }
  td {
    font-family: var(--font-mono);
  }
  @media (min-width: 40rem) {
    .metric-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .compact-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
