<script lang="ts">
  import type { PageData } from './$types';
  import {
    formatCount,
    formatDuration,
    formatProductLabel,
    formatTimestamp,
  } from '../dashboard/dashboard-view';
  import {
    activityBars,
    attentionItems,
    commandHealthSummary,
    formatActivityAction,
    latestActivityDay,
    recentSignupCount,
  } from './admin-view';

  let { data }: { data: PageData } = $props();
  let attention = $derived(attentionItems(data.overview));
  let bars = $derived(activityBars(data.overview));
  let commandHealth = $derived(commandHealthSummary(data.overview));
  let latestDay = $derived(latestActivityDay(data.overview));
  let signups = $derived(recentSignupCount(data.overview));
</script>

<svelte:head>
  <title>Admin overview - OMG Package Manager</title>
  <meta
    name="description"
    content="Private OMG operator overview for user, product, fleet, and billing activity."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="operator-shell">
  <header class="workspace-header">
    <div>
      <p class="page-kicker">Command center / live platform state</p>
      <h1>Today at OMG</h1>
      <p>
        Immediate platform signals, current exceptions, product activity, and the latest audit
        events.
      </p>
    </div>
    <div class="operator-meta">
      <span>Signed in as</span>
      <strong>{data.operatorName}</strong>
      <a href="/dashboard/">Account dashboard →</a>
    </div>
  </header>

  <section class="status-strip" aria-labelledby="command-health-title">
    <div class="status-indicator" data-tone={commandHealth.tone} aria-hidden="true"></div>
    <div>
      <span id="command-health-title">{commandHealth.label}</span>
      <strong>{commandHealth.value}</strong>
      <small>{commandHealth.detail}</small>
    </div>
    <dl>
      <div>
        <dt>Usage</dt>
        <dd>30 days</dd>
      </div>
      <div>
        <dt>Activity</dt>
        <dd>14 days</dd>
      </div>
      <div>
        <dt>Signups</dt>
        <dd>7 days</dd>
      </div>
    </dl>
  </section>

  <section id="overview" class="metric-panel" aria-label="Key platform metrics">
    <dl>
      <div class="primary-metric">
        <dt>Total users</dt>
        <dd>{formatCount(data.overview.totalUsers)}</dd>
        <small>+{formatCount(signups)} in the recorded signup window</small>
      </div>
      <div>
        <dt>Active licenses</dt>
        <dd>{formatCount(data.overview.activeLicenses)}</dd>
      </div>
      <div>
        <dt>Active machines</dt>
        <dd>{formatCount(data.overview.activeMachines)}</dd>
      </div>
      <div>
        <dt>Commands / 30d</dt>
        <dd>{formatCount(data.overview.commands30d)}</dd>
      </div>
      <div>
        <dt>Total installs</dt>
        <dd>{formatCount(data.overview.totalInstalls)}</dd>
      </div>
    </dl>
  </section>

  <div class="overview-grid">
    <section class="work-panel attention-panel" aria-labelledby="attention-title">
      <header class="panel-header">
        <div>
          <span>01 / Triage</span>
          <h2 id="attention-title">Needs attention</h2>
        </div>
        <small>{formatCount(attention.length)} open</small>
      </header>
      {#if attention.length === 0}
        <div class="empty-state">
          <strong>No fleet or billing exceptions.</strong>
          <p>Command health is reported separately above.</p>
        </div>
      {:else}
        <ul class="attention-list">
          {#each attention as item (`${item.label}:${item.value}`)}
            <li data-tone={item.tone}>
              <span class="attention-marker" aria-hidden="true"></span>
              <div>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="work-panel product-panel" aria-labelledby="product-title">
      <header class="panel-header">
        <div>
          <span>02 / Product</span>
          <h2 id="product-title">Usage pulse</h2>
        </div>
        <small>Exact totals</small>
      </header>
      <dl class="product-facts">
        <div>
          <dt>Packages installed</dt>
          <dd>{formatCount(data.overview.packagesInstalled30d)}</dd>
        </div>
        <div>
          <dt>Package searches</dt>
          <dd>{formatCount(data.overview.searches30d)}</dd>
        </div>
        <div>
          <dt>Recorded time saved</dt>
          <dd>{formatDuration(data.overview.timeSavedMs30d)}</dd>
        </div>
        <div>
          <dt>Latest recorded day</dt>
          {#if latestDay === null}
            <dd>Unavailable</dd>
            <small>No daily CLI activity recorded</small>
          {:else}
            <dd>{formatTimestamp(latestDay.date)}</dd>
            <small>
              {formatCount(latestDay.activeUsers)} users / {formatCount(latestDay.commands)}
              commands
            </small>
          {/if}
        </div>
      </dl>
    </section>
  </div>

  <div id="activity" class="activity-grid">
    <section class="work-panel chart-panel" aria-labelledby="activity-chart-title">
      <header class="panel-header">
        <div>
          <span>03 / Activity</span>
          <h2 id="activity-chart-title">CLI activity</h2>
        </div>
        <small>Commands / active users</small>
      </header>
      {#if bars.length === 0}
        <div class="empty-state"><strong>No daily CLI activity recorded.</strong></div>
      {:else}
        <ol class="activity-chart">
          {#each bars as bar (bar.date)}
            <li>
              <time datetime={bar.date}>{bar.date}</time>
              <div class="bar-track" aria-hidden="true">
                <span style={`--bar-width: ${bar.widthPercent}%`}></span>
              </div>
              <strong>{formatCount(bar.commands)}</strong>
              <small>{formatCount(bar.activeUsers)} users</small>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <section class="work-panel event-panel" aria-labelledby="recent-activity-title">
      <header class="panel-header">
        <div>
          <span>04 / Audit</span>
          <h2 id="recent-activity-title">Latest events</h2>
        </div>
        <small>Identifiers removed</small>
      </header>
      {#if data.overview.activity.length === 0}
        <div class="empty-state"><strong>No operator activity available.</strong></div>
      {:else}
        <ol class="event-list">
          {#each data.overview.activity as item, index (`${item.createdAt}:${item.action}:${index}`)}
            <li>
              <span class="event-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{formatActivityAction(item.action)}</strong>
                <small>
                  {item.resourceType === null
                    ? 'Platform event'
                    : formatProductLabel(item.resourceType)}
                </small>
              </div>
              <time datetime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </div>

  <section id="breakdowns" class="breakdown-panel" aria-labelledby="breakdowns-title">
    <header class="panel-header breakdown-heading">
      <div>
        <span>05 / Detail</span>
        <h2 id="breakdowns-title">Operational breakdowns</h2>
      </div>
      <small>Closed by default</small>
    </header>

    <details>
      <summary>
        <span>Fleet and installs</span>
        <small>Versions / platforms</small>
      </summary>
      <div class="breakdown-columns">
        <section aria-labelledby="fleet-versions-title">
          <h3 id="fleet-versions-title">Active fleet versions</h3>
          {#if data.overview.fleetVersions.length === 0}
            <p class="muted-copy">No active fleet version data.</p>
          {:else}
            <dl class="breakdown-list">
              {#each data.overview.fleetVersions as item (item.label)}
                <div>
                  <dt>{item.label}</dt>
                  <dd>{formatCount(item.count)}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>
        <section aria-labelledby="install-platform-title">
          <h3 id="install-platform-title">Installs by platform</h3>
          {#if data.overview.installsByPlatform.length === 0}
            <p class="muted-copy">No install platform data.</p>
          {:else}
            <dl class="breakdown-list">
              {#each data.overview.installsByPlatform as item (item.label)}
                <div>
                  <dt>{formatProductLabel(item.label)}</dt>
                  <dd>{formatCount(item.count)}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>
      </div>
    </details>

    <details>
      <summary>
        <span>Plans and billing</span>
        <small>Tiers / subscription states</small>
      </summary>
      <div class="breakdown-columns">
        <section aria-labelledby="license-tiers-title">
          <h3 id="license-tiers-title">License tiers</h3>
          {#if data.overview.tiers.length === 0}
            <p class="muted-copy">No license tier data.</p>
          {:else}
            <dl class="breakdown-list">
              {#each data.overview.tiers as item (item.label)}
                <div>
                  <dt>{formatProductLabel(item.label)}</dt>
                  <dd>{formatCount(item.count)}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>
        <section aria-labelledby="subscription-status-title">
          <h3 id="subscription-status-title">Subscription states</h3>
          {#if data.overview.subscriptions.length === 0}
            <p class="muted-copy">No subscription data.</p>
          {:else}
            <dl class="breakdown-list">
              {#each data.overview.subscriptions as item (item.label)}
                <div>
                  <dt>{formatProductLabel(item.label)}</dt>
                  <dd>{formatCount(item.count)}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>
      </div>
    </details>
  </section>
</main>

<style>
  .operator-shell {
    width: min(calc(100% - clamp(2rem, 5vw, 6rem)), 112rem);
    margin-inline: auto;
    padding-block: clamp(2.25rem, 4vw, 4.5rem) 6rem;
  }

  .workspace-header {
    display: grid;
    gap: 2rem;
    align-items: end;
    padding-bottom: 2rem;
  }

  .workspace-header h1 {
    margin: 0.65rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(2.6rem, 5vw, 5.5rem);
    font-weight: 670;
    letter-spacing: -0.07em;
    line-height: 0.9;
  }

  .workspace-header p:not(.page-kicker) {
    max-width: 44rem;
    margin: 1rem 0 0;
    color: var(--ink-muted);
    font-size: 1rem;
  }

  .operator-meta {
    display: grid;
    gap: 0.25rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--rule-strong);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .operator-meta span,
  .operator-meta a {
    color: var(--ink-muted);
  }

  .operator-meta a {
    width: fit-content;
    margin-top: 0.65rem;
    text-underline-offset: 0.2rem;
  }

  .operator-meta a:hover {
    color: var(--signal);
  }

  .status-strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
    padding: 1rem;
    border: 1px solid var(--rule);
    background: var(--paper-raised);
  }

  .status-indicator {
    width: 0.65rem;
    height: 0.65rem;
    margin-top: 0.3rem;
    background: var(--ink);
  }

  .status-indicator[data-tone='urgent'] {
    background: var(--danger);
  }

  .status-strip > div:nth-child(2) span,
  .status-strip > div:nth-child(2) strong,
  .status-strip > div:nth-child(2) small {
    display: block;
  }

  .status-strip span,
  .status-strip dt,
  .panel-header span,
  .panel-header small {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .status-strip strong {
    margin-top: 0.1rem;
    font-size: 0.95rem;
  }

  .status-strip small {
    margin-top: 0.15rem;
    color: var(--ink-muted);
    font-size: 0.72rem;
  }

  .status-strip dl {
    display: none;
    gap: 1.5rem;
    margin: 0;
  }

  .status-strip dl div {
    min-width: 5rem;
  }

  .status-strip dt,
  .status-strip dd {
    margin: 0;
  }

  .status-strip dd {
    margin-top: 0.2rem;
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .metric-panel {
    margin-top: 1.25rem;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }

  .metric-panel dl {
    display: grid;
    margin: 0;
  }

  .metric-panel dl > div {
    min-width: 0;
    padding: 1.25rem;
    border-bottom: 1px solid var(--rule);
  }

  .metric-panel dl > div:last-child {
    border-bottom: 0;
  }

  .metric-panel dt,
  .metric-panel dd,
  .metric-panel small {
    display: block;
    margin: 0;
  }

  .metric-panel dt,
  .product-facts dt,
  .breakdown-list dt {
    color: var(--ink-muted);
    font-size: 0.78rem;
  }

  .metric-panel dd {
    margin-top: 0.35rem;
    font-family: var(--font-mono);
    font-size: clamp(2rem, 3vw, 3.5rem);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: -0.06em;
    line-height: 1;
  }

  .metric-panel small {
    margin-top: 0.55rem;
    color: var(--ink-muted);
    font-size: 0.72rem;
  }

  .overview-grid,
  .activity-grid {
    display: grid;
    gap: 1.25rem;
    margin-top: 1.25rem;
  }

  .work-panel,
  .breakdown-panel {
    min-width: 0;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }

  .panel-header {
    display: flex;
    gap: 1rem;
    align-items: end;
    justify-content: space-between;
    min-height: 5rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--rule-strong);
  }

  .panel-header h2 {
    margin: 0.2rem 0 0;
    font-family: var(--font-display);
    font-size: 1.45rem;
    letter-spacing: -0.045em;
    line-height: 1;
  }

  .attention-list,
  .activity-chart,
  .event-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .attention-list li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.85rem;
    padding: 1.15rem 1.25rem;
    border-bottom: 1px solid var(--rule);
  }

  .attention-list li:last-child {
    border-bottom: 0;
  }

  .attention-marker {
    width: 0.55rem;
    height: 0.55rem;
    margin-top: 0.35rem;
    background: var(--signal);
  }

  .attention-list [data-tone='urgent'] .attention-marker {
    background: var(--danger);
  }

  .attention-list p,
  .attention-list strong,
  .attention-list small {
    display: block;
    margin: 0;
  }

  .attention-list p {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .attention-list strong {
    margin-top: 0.15rem;
    font-size: 1rem;
  }

  .attention-list small {
    margin-top: 0.35rem;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .empty-state {
    min-height: 8rem;
    padding: 1.5rem 1.25rem;
  }

  .empty-state strong {
    font-size: 0.95rem;
  }

  .empty-state p,
  .muted-copy {
    margin: 0.4rem 0 0;
    color: var(--ink-muted);
    font-size: 0.78rem;
  }

  .product-facts {
    display: grid;
    margin: 0;
  }

  .product-facts > div {
    padding: 1.1rem 1.25rem;
    border-bottom: 1px solid var(--rule);
  }

  .product-facts > div:last-child {
    border-bottom: 0;
  }

  .product-facts dt,
  .product-facts dd,
  .product-facts small {
    display: block;
    margin: 0;
  }

  .product-facts dd {
    margin-top: 0.2rem;
    font-family: var(--font-mono);
    font-size: 1.2rem;
  }

  .product-facts small {
    margin-top: 0.35rem;
    color: var(--ink-muted);
    font-size: 0.72rem;
  }

  .activity-chart li {
    display: grid;
    grid-template-columns: 5.75rem minmax(3rem, 1fr) 3rem;
    gap: 0.75rem;
    align-items: center;
    padding: 0.7rem 1.25rem;
    border-bottom: 1px solid var(--rule);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .activity-chart li:last-child {
    border-bottom: 0;
  }

  .activity-chart li > small {
    display: none;
    color: var(--ink-muted);
  }

  .activity-chart li > strong {
    text-align: right;
  }

  .bar-track {
    height: 0.5rem;
    background: var(--paper);
  }

  .bar-track span {
    display: block;
    width: var(--bar-width);
    height: 100%;
    background: var(--signal);
  }

  .event-list li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--rule);
  }

  .event-list li:last-child {
    border-bottom: 0;
  }

  .event-index,
  .event-list small,
  .event-list time {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }

  .event-list li div {
    min-width: 0;
  }

  .event-list li div strong,
  .event-list li div small {
    display: block;
    overflow-wrap: anywhere;
  }

  .event-list li div small {
    margin-top: 0.2rem;
  }

  .event-list time {
    grid-column: 2;
  }

  .breakdown-panel {
    margin-top: 1.25rem;
    scroll-margin-top: 1rem;
  }

  .breakdown-heading {
    min-height: 5.5rem;
  }

  .breakdown-panel details {
    border-bottom: 1px solid var(--rule-strong);
  }

  .breakdown-panel details:last-child {
    border-bottom: 0;
  }

  .breakdown-panel summary {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    justify-content: space-between;
    padding: 1.15rem 1.25rem;
    cursor: pointer;
  }

  .breakdown-panel summary::marker {
    color: var(--signal);
  }

  .breakdown-panel summary span {
    font-size: 0.95rem;
    font-weight: 650;
  }

  .breakdown-panel summary small {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }

  .breakdown-columns {
    display: grid;
    gap: 2rem;
    padding: 0.5rem 1.25rem 1.5rem;
  }

  .breakdown-columns h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.95rem;
  }

  .breakdown-list {
    margin: 0.8rem 0 0;
  }

  .breakdown-list div {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding-block: 0.65rem;
    border-top: 1px solid var(--rule);
  }

  .breakdown-list dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.76rem;
  }

  @media (min-width: 42rem) {
    .workspace-header {
      grid-template-columns: minmax(0, 1fr) 15rem;
    }

    .status-strip {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
    }

    .status-strip dl {
      display: flex;
    }

    .metric-panel dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric-panel dl > div {
      border-right: 1px solid var(--rule);
    }

    .metric-panel dl > div:nth-child(2n) {
      border-right: 0;
    }

    .product-facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .product-facts > div:nth-child(odd) {
      border-right: 1px solid var(--rule);
    }

    .event-list li {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: baseline;
    }

    .event-list time {
      grid-column: auto;
    }

    .breakdown-columns {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 68rem) {
    .metric-panel dl {
      grid-template-columns: 1.35fr repeat(4, minmax(0, 1fr));
    }

    .metric-panel dl > div,
    .metric-panel dl > div:nth-child(2n) {
      border-right: 1px solid var(--rule);
      border-bottom: 0;
    }

    .metric-panel dl > div:last-child {
      border-right: 0;
    }

    .overview-grid {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    }

    .activity-grid {
      grid-template-columns: minmax(0, 1.35fr) minmax(22rem, 0.65fr);
    }

    .activity-chart li {
      grid-template-columns: 5.75rem minmax(3rem, 1fr) 3rem 3.5rem;
    }

    .activity-chart li > small {
      display: block;
      text-align: right;
    }
  }
</style>
