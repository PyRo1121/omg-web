<script lang="ts">
  import type { PageData } from './$types';
  import { formatCount, formatProductLabel, formatTimestamp } from '../../dashboard/dashboard-view';
  import { adminAuditNavigation } from './admin-audit-view';

  let { data }: { data: PageData } = $props();
  const navigation = $derived(
    adminAuditNavigation(data.audit.pagination.page, data.audit.pagination.pages, data.action)
  );
</script>

<svelte:head
  ><title>Audit history - OMG Admin</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>

<main id="main-content" class="workspace">
  <header class="page-header">
    <div>
      <p>Audit / security history</p>
      <h1>Operator audit log</h1>
      <span
        >Newest first. Private database identifiers and metadata payloads are removed server-side.</span
      >
    </div>
    <div class="exports">
      <a href="/admin/exports/audit/">Audit CSV</a><a href="/admin/exports/users/">Users CSV</a><a
        href="/admin/exports/usage/">Usage CSV</a
      >
    </div>
  </header>

  <form method="GET" class="filters" aria-label="Audit filters">
    <label for="action">Exact action</label><input
      id="action"
      name="action"
      value={data.action}
      placeholder="auth.login"
      maxlength="128"
      pattern={'[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){1,4}'}
    />
    <button type="submit">Apply filter</button>{#if data.action !== ''}<a href="/admin/audit/"
        >Clear</a
      >{/if}
  </form>

  <section class="panel" aria-labelledby="history-title">
    <header>
      <h2 id="history-title">Recorded actions</h2>
      <span>{formatCount(data.audit.pagination.total)} matching events</span>
    </header>
    {#if data.audit.logs.length === 0}<p class="empty">
        No audit events match this filter.
      </p>{:else}<div class="table-scroll">
        <table>
          <thead><tr><th>Recorded</th><th>Action</th><th>Actor</th><th>Network</th></tr></thead
          ><tbody
            >{#each data.audit.logs as event, index (`${event.createdAt}:${event.action}:${index}`)}<tr
                ><td><time datetime={event.createdAt}>{formatTimestamp(event.createdAt)}</time></td
                ><td>{formatProductLabel(event.action)}</td><td>{event.email ?? 'System'}</td><td
                  >{event.ipAddress ?? 'Unavailable'}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>{/if}
  </section>

  <nav class="pagination" aria-label="Audit pages">
    <a
      class={navigation.hasPrevious ? undefined : 'disabled'}
      aria-disabled={!navigation.hasPrevious}
      href={navigation.previousHref}>Previous</a
    ><span>Page {formatCount(navigation.currentPage)} of {formatCount(navigation.totalPages)}</span
    ><a
      class={navigation.hasNext ? undefined : 'disabled'}
      aria-disabled={!navigation.hasNext}
      href={navigation.nextHref}>Next</a
    >
  </nav>
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
  th,
  label {
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
  .exports {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .exports a,
  .pagination a,
  .filters a,
  .filters button {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--rule-strong);
    color: var(--ink);
    background: transparent;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-decoration: none;
    text-transform: uppercase;
  }
  .filters {
    display: grid;
    grid-template-columns: auto minmax(12rem, 24rem) auto auto;
    gap: 0.6rem;
    align-items: center;
    margin-top: 2rem;
    padding: 1rem;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }
  input {
    min-width: 0;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--rule-strong);
    border-radius: 0;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }
  .filters button {
    cursor: pointer;
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
  .pagination {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: flex-end;
    margin-top: 1rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .disabled {
    pointer-events: none;
    opacity: 0.35;
  }
  @media (max-width: 44rem) {
    .filters {
      grid-template-columns: 1fr;
    }
    .pagination {
      justify-content: space-between;
    }
    .pagination span {
      font-size: 0.62rem;
    }
  }
</style>
