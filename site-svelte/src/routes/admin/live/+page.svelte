<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { formatCount, formatProductLabel } from '../../dashboard/dashboard-view';
  import { AdminLiveFeed } from './admin-live.svelte';

  let { data }: { data: PageData } = $props();
  const feed = new AdminLiveFeed(untrack(() => data.live));
  const statusLabel = $derived(
    feed.state === 'refreshing'
      ? 'Refreshing'
      : feed.state === 'paused'
        ? 'Paused while hidden'
        : feed.state === 'unavailable'
          ? 'Retrying after an unavailable response'
          : 'Current'
  );

  $effect(() => feed.start());
</script>

<svelte:head
  ><title>Live activity - OMG Admin</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>

<main id="main-content" class="workspace">
  <header class="page-header">
    <div>
      <p>Live / 5-second polling</p>
      <h1>Command activity</h1>
      <span
        >Privacy-reduced events. Raw event, session, machine, and property identifiers never reach
        the browser.</span
      >
    </div>
    <output class={feed.state === 'unavailable' ? 'warning' : undefined}>{statusLabel}</output>
  </header>

  <section class="panel" aria-labelledby="feed-title" aria-live="polite">
    <header>
      <h2 id="feed-title">Latest events</h2>
      <span>{formatCount(feed.events.length)} retained in this view</span>
    </header>
    {#if feed.events.length === 0}<p class="empty">
        No command activity has been recorded.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead
            ><tr
              ><th>Recorded</th><th>Event</th><th>Type</th><th>Platform</th><th>Version</th><th
                >Duration</th
              ></tr
            ></thead
          ><tbody>
            {#each feed.events as event (`${event.timestamp}:${event.createdAt}:${event.eventType}:${event.eventName}:${event.platform}`)}<tr
                ><td>{event.createdAt}</td><td>{formatProductLabel(event.eventName)}</td><td
                  >{formatProductLabel(event.eventType)}</td
                ><td>{formatProductLabel(event.platform)}</td><td>{event.version}</td><td
                  >{event.durationMs === null ? '—' : `${formatCount(event.durationMs)} ms`}</td
                ></tr
              >{/each}
          </tbody>
        </table>
      </div>{/if}
  </section>
  <p class="footnote">
    Polling stops when this tab is hidden, resumes when visible, and retains at most 100 events in
    browser memory.
  </p>
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
  .page-header h1 {
    max-width: 12ch;
    margin: 0.55rem 0 0.8rem;
    font-family: var(--font-display);
    font-size: clamp(2.6rem, 6vw, 5.5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
  }
  output {
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--rule-strong);
    color: var(--ok);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
  }
  .warning {
    color: var(--warning);
  }
  .panel {
    margin-top: 2rem;
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
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--rule);
    white-space: nowrap;
  }
  td {
    font-size: 0.75rem;
  }
  .empty {
    margin: 0;
    padding: 1.3rem 1.2rem;
    color: var(--ink-muted);
    font-size: 0.78rem;
  }
  .footnote {
    max-width: 72ch;
    color: var(--ink-muted);
    font-size: 0.7rem;
  }
</style>
