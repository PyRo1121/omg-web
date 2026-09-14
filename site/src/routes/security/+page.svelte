<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { SITE_ORIGIN } from '../../../../shared/public-site';
  import { SECURITY_CATEGORIES, commitHref } from '../../lib/security-updates';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let category = $state('All updates');
  let repository = $state('all');
  let refreshFailed = $state(false);
  const canonicalUrl = `${SITE_ORIGIN}/security/`;
  let visible = $derived(
    data.feed.updates.filter(
      update =>
        (category === 'All updates' || update.category === category) &&
        (repository === 'all' || update.repository === repository)
    )
  );
  let referenceTime = $derived(Date.parse(data.feed.syncedAt));
  let weekStart = $derived(Math.floor(referenceTime / 86_400_000) * 86_400_000 - 6 * 86_400_000);
  let recent = $derived(
    data.feed.updates.filter(update => {
      const timestamp = Date.parse(update.date);
      return timestamp <= referenceTime && timestamp >= weekStart;
    })
  );
  let activeDays = $derived(
    new Set(recent.map(update => new Date(update.date).toISOString().slice(0, 10))).size
  );
  let activity = $derived(
    Array.from({ length: 28 }, (_, index) => {
      const day = new Date(referenceTime - (27 - index) * 86_400_000).toISOString().slice(0, 10);
      return {
        day,
        count: data.feed.updates.filter(
          update => new Date(update.date).toISOString().slice(0, 10) === day
        ).length,
      };
    })
  );
  function displayDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(date));
  }
  onMount(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void invalidate('omg:security-updates')
        .then(() => {
          refreshFailed = false;
        })
        .catch(() => {
          refreshFailed = true;
        });
    };
    const timer = window.setInterval(refresh, 300_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  });
</script>

<svelte:head>
  <title>Security, in the open — OMG</title>
  <meta
    name="description"
    content="Follow OMG security improvements as they land. Live commit history, installation protections and verifiable changes across OMG and OMG-Web."
  />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:title" content="Security, in the open — OMG" />
  <meta
    property="og:description"
    content="Every improvement has a history. Follow the changes. Read the commits."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
</svelte:head>

<main id="main-content" class="security-shell">
  <header class="hero">
    <div>
      <p class="eyebrow"><span class="signal-dot" aria-hidden="true"></span> OMG / security</p>
      <h1>Security,<br /><span>in the open.</span></h1>
      <p class="intro">
        Safer installation defaults, with fewer security settings to assemble yourself. Follow the
        protections and the code behind them.
      </p>
      <a class="hero-link" href="#updates">Explore the updates <span aria-hidden="true">↓</span></a>
    </div>
    <aside class="activity" aria-label="Security commit activity">
      <div class="activity-heading">
        <span>Always improving</span><span class="mono">28 days</span>
      </div>
      <div class="activity-grid" aria-label="Daily security commits over the last 28 days">
        {#each activity as day (day.day)}
          <span
            class:active={day.count > 0}
            class:busy={day.count > 3}
            title={`${day.day}: ${day.count} security commits`}
            aria-label={`${day.day}: ${day.count} security commits`}
          ></span>
        {/each}
      </div>
      <div class="activity-stats">
        <div><strong>{recent.length}</strong><span>commits this week</span></div>
        <div><strong>{activeDays}<small>/7</small></strong><span>days with updates</span></div>
      </div>
      <p>Activity from the security updates below.<br />Two repositories. One continuous effort.</p>
    </aside>
  </header>

  <section class="principles" aria-label="Security priorities">
    <article>
      <span class="index">01 / BEFORE INSTALL</span>
      <h2>Check what comes in.</h2>
      <p>
        Managed npm tool installs check signatures before activation. Python tool installs require
        wheels by default, keeping source-build execution an explicit exception.
      </p>
    </article>
    <article>
      <span class="index">02 / DURING INSTALL</span>
      <h2>Limit what runs.</h2>
      <p>
        Managed installers use controlled configuration and Linux privilege restrictions. AUR builds
        use a separate Bubblewrap policy with a private home and no build network by default.
      </p>
    </article>
    <article>
      <span class="index">03 / AFTER INSTALL</span>
      <h2>Keep the evidence.</h2>
      <p>
        Managed-tool receipts record policy and executable hashes. Staged replacements and
        activation rollback help preserve a working tool when an update fails.
      </p>
    </article>
  </section>

  <p class="feed-note">
    These protections are implemented in <a href="https://github.com/PyRo1121/omg/pull/399"
      >PR #399</a
    >; check release notes for your installed version. They apply to OMG-managed operations,
    including
    <code>omg tool install</code>. Selecting Node with OMG does not change direct npm commands.
    <a
      href="https://github.com/PyRo1121/omg/blob/codex/blue-team-pipeline-20260913/docs/omarchy.md#compare-the-actual-defaults"
      >Compare the defaults and evidence</a
    >.
  </p>

  <section id="updates" class="updates" aria-labelledby="updates-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">The ongoing work</p>
        <h2 id="updates-heading">A record you can read.</h2>
      </div>
      <a href="https://github.com/PyRo1121/omg/pull/399"
        >Release hardening PR <span aria-hidden="true">↗</span></a
      >
    </div>
    <div class="sync-status" role="status">
      <span class="signal-dot" class:muted={data.feed.stale || refreshFailed} aria-hidden="true"
      ></span>
      {#if data.feed.stale || refreshFailed}Showing saved updates · live refresh temporarily
        unavailable{:else}Synced with GitHub · refreshes every 5 minutes{/if}
      <time datetime={data.feed.syncedAt}
        >Last sync {displayDate(data.feed.syncedAt)} · {new Date(data.feed.syncedAt)
          .toISOString()
          .slice(11, 16)} UTC</time
      >
    </div>
    <div class="filters">
      <div class="category-filters" aria-label="Filter security updates">
        {#each SECURITY_CATEGORIES as item (item)}<button
            type="button"
            aria-pressed={category === item}
            onclick={() => {
              category = item;
            }}>{item}</button
          >{/each}
      </div>
      <label
        >Repository <select bind:value={repository}
          ><option value="all">Both projects</option><option value="omg">OMG</option><option
            value="omg-web">OMG-Web</option
          ></select
        ></label
      >
    </div>
    <p class="result-count" aria-live="polite">
      {visible.length} updates <span>· Review and merge status are labeled individually.</span>
    </p>
    <p class="feed-note">
      Rows marked In review are implemented fixes in the open hardening
      <a href="https://github.com/PyRo1121/omg/pull/399">PR #399</a>, awaiting review and merge. On
      main means merged; Released means included in a tagged build you can install. Merging alone
      does not put a fix in the latest release.
    </p>
    <div class="timeline">
      {#each visible as update (update.repository + update.sha)}
        <details>
          <summary
            ><time datetime={update.date}>{displayDate(update.date)}</time>
            <div class="entry-heading">
              <span class="entry-meta"
                >{update.repository === 'omg' ? 'OMG' : 'OMG-Web'} <span aria-hidden="true">/</span>
                {update.category}</span
              >
              <h3>{update.title}</h3>
            </div>
            <span class="branch" class:development={update.branch === 'development'}
              >{update.branch === 'main' ? 'On main' : 'In review'}</span
            ><span class="expand" aria-hidden="true">+</span></summary
          >
          <div class="entry-body">
            <p>
              {update.detail ||
                'This update is recorded in the project’s public commit history. Open the commit for the complete change and discussion.'}
            </p>
            <a class="commit-link" href={commitHref(update)}
              >View commit <code>{update.sha.slice(0, 8)}</code><span aria-hidden="true">↗</span></a
            >
          </div>
        </details>
      {:else}<div class="empty">
          <h3>No updates in this view.</h3>
          <p>Choose another category or repository to explore the history.</p>
          <button
            type="button"
            onclick={() => {
              category = 'All updates';
              repository = 'all';
            }}>Show all updates</button
          >
        </div>{/each}
    </div>
    <p class="feed-note">
      Automatically selected from recent public commits using security and hardening titles. Counts
      describe this feed, not vulnerabilities or completed audits. A commit on main does not
      necessarily mean it is in a published release. <a href="/updates/">See release notes.</a>
    </p>
  </section>

  <section class="reporting" aria-labelledby="reporting-heading">
    <div>
      <p class="eyebrow">Keep the conversation open</p>
      <h2 id="reporting-heading">Found something?<br />Tell us privately.</h2>
    </div>
    <div>
      <p>
        Send a description, the affected version and steps to reproduce. We’ll investigate and work
        toward a fix.
      </p>
      <a href="mailto:olen@latham.cloud">Report a vulnerability <span aria-hidden="true">↗</span></a
      ><a class="secondary-link" href="/docs/security/">Read the security documentation</a>
    </div>
  </section>
</main>

<style>
  .security-shell {
    width: min(calc(100% - 2rem), 80rem);
    margin-inline: auto;
  }
  .hero {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 4rem;
    align-items: end;
    padding-block: clamp(4rem, 8vw, 8rem);
  }
  .eyebrow,
  .index,
  .mono,
  .entry-meta,
  .result-count,
  .branch,
  .sync-status,
  .filters,
  .commit-link {
    font-family: var(--font-mono);
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: var(--signal);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 1.75rem;
  }
  .signal-dot {
    display: inline-block;
    width: 0.45rem;
    height: 0.45rem;
    flex: 0 0 auto;
    background: var(--signal);
    border-radius: 50%;
  }
  .signal-dot.muted {
    background: var(--ink-muted);
  }
  h1 {
    font-size: clamp(4rem, 8.5vw, 7.5rem);
    font-weight: 650;
    line-height: 0.94;
    letter-spacing: -0.07em;
    margin: 0;
  }
  h1 span {
    color: var(--ink-muted);
  }
  .intro {
    max-width: 32ch;
    color: var(--ink-muted);
    font-size: 1.2rem;
    line-height: 1.7;
    margin: 2rem 0;
  }
  .hero-link {
    display: inline-flex;
    gap: 3rem;
    align-items: center;
    background: var(--signal);
    color: var(--signal-ink);
    padding: 1rem 1.25rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    text-decoration: none;
  }
  .activity {
    border-top: 2px solid var(--signal);
    background: var(--paper-raised);
    padding: 1.75rem;
  }
  .activity-heading {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.95rem;
  }
  .mono {
    color: var(--ink-muted);
    font-size: 0.7rem;
  }
  .activity-grid {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    gap: 0.3rem;
    margin: 2rem 0;
  }
  .activity-grid span {
    aspect-ratio: 1;
    background: var(--rule);
  }
  .activity-grid .active {
    background: #8b3928;
  }
  .activity-grid .busy {
    background: var(--signal);
  }
  .activity-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .activity-stats strong {
    display: block;
    font-size: 3.5rem;
    font-weight: 550;
    letter-spacing: -0.06em;
    line-height: 1.2;
  }
  .activity-stats small {
    color: var(--ink-muted);
    font-size: 1.3rem;
  }
  .activity-stats span,
  .activity p {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  .activity p {
    border-top: 1px solid var(--rule);
    margin: 1.5rem 0 0;
    padding-top: 1rem;
    line-height: 1.8;
  }
  .principles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-block: 1px solid var(--rule);
  }
  .principles article {
    padding: 2rem;
    border-right: 1px solid var(--rule);
  }
  .principles article:first-child {
    padding-left: 0;
  }
  .principles article:last-child {
    border: 0;
    padding-right: 0;
  }
  .index {
    font-size: 0.65rem;
    color: var(--signal);
    letter-spacing: 0.04em;
  }
  .principles h2 {
    font-size: 1.4rem;
    letter-spacing: -0.03em;
    margin: 1.1rem 0 0.75rem;
    font-weight: 550;
  }
  .principles p {
    color: var(--ink-muted);
    font-size: 0.9rem;
    line-height: 1.8;
    margin: 0;
  }
  .updates {
    padding-block: 6rem;
    scroll-margin-top: 2rem;
  }
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 2rem;
  }
  .section-heading .eyebrow {
    margin-bottom: 1rem;
  }
  .section-heading h2,
  .reporting h2 {
    font-size: clamp(2rem, 4vw, 3.5rem);
    line-height: 1.05;
    letter-spacing: -0.055em;
    font-weight: 550;
    margin: 0;
  }
  .section-heading > a {
    font-size: 0.75rem;
    font-family: var(--font-mono);
    white-space: nowrap;
    text-underline-offset: 0.3em;
  }
  .sync-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem;
    color: var(--ink-muted);
    font-size: 0.65rem;
    line-height: 1.8;
    padding-bottom: 1.5rem;
  }
  .sync-status time {
    margin-left: auto;
  }
  .filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    padding-block: 1.25rem;
    border-block: 1px solid var(--rule);
  }
  .category-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  button,
  select {
    font: inherit;
    font-size: 0.65rem;
    border: 1px solid var(--rule);
    color: var(--ink-muted);
    background: transparent;
    padding: 0.7rem 0.8rem;
    cursor: pointer;
    min-height: 2.75rem;
  }
  button[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  button:hover,
  select:hover {
    border-color: var(--ink-muted);
  }
  select {
    background: var(--paper);
    margin-left: 0.5rem;
  }
  label {
    color: var(--ink-muted);
    font-size: 0.65rem;
  }
  .result-count {
    font-size: 0.65rem;
    margin-block: 1.5rem;
    color: var(--ink);
    line-height: 1.8;
  }
  .result-count span {
    color: var(--ink-muted);
  }
  details {
    border-top: 1px solid var(--rule);
  }
  details:last-child {
    border-bottom: 1px solid var(--rule);
  }
  summary {
    display: grid;
    grid-template-columns: 8rem 1fr auto 1rem;
    align-items: center;
    gap: 1.5rem;
    padding: 1.75rem 0;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary > time {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
  }
  .entry-meta {
    display: flex;
    gap: 0.6rem;
    font-size: 0.6rem;
    color: var(--ink-muted);
  }
  .entry-meta > span {
    color: var(--signal);
  }
  h3 {
    font-size: 1.05rem;
    line-height: 1.5;
    font-weight: 500;
    margin: 0.5rem 0 0;
    overflow-wrap: anywhere;
  }
  .branch {
    border: 1px solid var(--rule);
    padding: 0.35rem 0.5rem;
    font-size: 0.6rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .branch.development {
    color: var(--signal);
  }
  .expand {
    color: var(--signal);
    font-size: 1.3rem;
  }
  details[open] .expand {
    transform: rotate(45deg);
  }
  .entry-body {
    padding: 0 3rem 2rem 9.5rem;
    max-width: 65rem;
  }
  .entry-body p {
    color: var(--ink-muted);
    white-space: pre-line;
    overflow-wrap: anywhere;
    font-size: 0.9rem;
    line-height: 1.85;
    margin: 0 0 1.25rem;
  }
  .commit-link {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.7rem;
    text-decoration: none;
    min-height: 2.75rem;
  }
  .commit-link code {
    color: var(--signal);
  }
  .commit-link:hover {
    text-decoration: underline;
    text-underline-offset: 0.3em;
  }
  .feed-note {
    max-width: 90ch;
    font-size: 0.75rem;
    line-height: 1.8;
    color: var(--ink-muted);
    margin-top: 1.5rem;
  }
  .empty {
    padding: 3rem 0;
  }
  .empty p {
    color: var(--ink-muted);
  }
  .reporting {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    padding: 3rem 0 5rem;
    border-top: 1px solid var(--rule);
  }
  .reporting p:not(.eyebrow) {
    color: var(--ink-muted);
    max-width: 45ch;
    line-height: 1.8;
  }
  .reporting a {
    display: block;
    width: fit-content;
    padding-block: 0.75rem;
    font-size: 0.85rem;
    text-underline-offset: 0.4em;
    text-decoration-color: var(--signal);
  }
  .reporting .secondary-link {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  @media (max-width: 64rem) {
    .hero {
      gap: 2rem;
    }
    summary {
      grid-template-columns: 6.5rem 1fr auto 1rem;
      gap: 1rem;
    }
    .entry-body {
      padding-left: 7.5rem;
    }
  }
  @media (max-width: 48rem) {
    .hero,
    .reporting {
      grid-template-columns: 1fr;
    }
    .activity {
      max-width: 32rem;
    }
    .principles {
      grid-template-columns: 1fr;
    }
    .principles article,
    .principles article:first-child,
    .principles article:last-child {
      padding: 1.75rem 0;
      border-right: 0;
      border-bottom: 1px solid var(--rule);
    }
    .principles article:last-child {
      border-bottom: 0;
    }
    .section-heading {
      align-items: start;
      flex-direction: column;
    }
    .sync-status time {
      width: 100%;
      margin-left: 0;
    }
    .updates {
      padding-block: 4rem;
    }
    summary {
      grid-template-columns: 1fr auto;
      gap: 0.75rem;
    }
    summary > time {
      grid-column: 1;
    }
    .entry-heading {
      grid-column: 1;
      grid-row: 2;
    }
    .branch {
      grid-column: 2;
      grid-row: 1;
    }
    .expand {
      grid-column: 2;
      grid-row: 2;
      justify-self: end;
    }
    .entry-body {
      padding: 0 0 1.75rem;
    }
    .reporting {
      gap: 1.5rem;
    }
    .result-count span {
      display: block;
    }
  }
</style>
