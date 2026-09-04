<script lang="ts">
  import AccountWorkspaceNav from '../../../../lib/components/AccountWorkspaceNav.svelte';
  import {
    formatProductLabel,
    formatTimestamp,
    organizationAuditActionLabel,
    organizationAuditPageHref,
  } from '../../dashboard-view';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let showOrganization = $derived(data.organizationAudit.status === 'available');
</script>

<svelte:head>
  <title>Organization audit - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel audit-panel" aria-labelledby="audit-title">
    <a class="back-link" href="/dashboard/organization/">← Organization overview</a>
    <p class="page-kicker">Organization intelligence</p>
    <h1 id="audit-title" class="account-title">Audit.</h1>

    <AccountWorkspaceNav active="organization" {showOrganization} />

    {#if data.organizationAudit.status === 'verification-required'}
      <p class="audit-state">Verify your email before opening organization history.</p>
    {:else if data.organizationAudit.status === 'no-organization'}
      <section class="audit-state-panel" aria-labelledby="no-organization-title">
        <p class="state-label">No organization</p>
        <h2 id="no-organization-title">Start with the workspace overview.</h2>
        <p>Create or join an eligible organization before reviewing shared history.</p>
        <a class="text-link" href="/dashboard/organization/">Open organization overview</a>
      </section>
    {:else if data.organizationAudit.status === 'unavailable'}
      <p class="audit-state" role="status">
        Organization history is temporarily unavailable. Membership and individual account tools
        still work.
      </p>
    {:else}
      <section class="audit-state-panel" aria-labelledby="organization-name">
        <div class="workspace-heading">
          <div>
            <p class="state-label">
              {data.organizationAudit.audit.organization.tier === null
                ? 'Plan unavailable'
                : formatProductLabel(data.organizationAudit.audit.organization.tier)}
              · {data.organizationAudit.audit.organization.role}
            </p>
            <h2 id="organization-name">{data.organizationAudit.audit.organization.name}</h2>
          </div>
          <span
            class={data.organizationAudit.audit.organization.status === 'restricted'
              ? 'status-mark restricted'
              : 'status-mark'}
          >
            {data.organizationAudit.audit.organization.status}
          </span>
        </div>

        {#if data.organizationAudit.audit.organization.status === 'restricted'}
          <p class="restriction" role="status">
            Organization history remains readable while membership growth is paused.
          </p>
        {/if}

        <nav class="organization-nav" aria-label="Organization workspace">
          <a href="/dashboard/organization/members/">People</a>
          <a href="/dashboard/organization/usage/">Usage</a>
          <a href="/dashboard/organization/audit/" aria-current="page">Audit</a>
        </nav>

        <div class="history-heading">
          <div>
            <p class="section-kicker">Recorded changes</p>
            <h3>Organization history</h3>
          </div>
          <span>Page {data.organizationAudit.audit.page}</span>
        </div>

        <nav class="filter-nav" aria-label="Filter organization history">
          <a
            href={organizationAuditPageHref('all', 1)}
            aria-current={data.organizationAudit.audit.filter === 'all' ? 'page' : undefined}>All</a
          >
          <a
            href={organizationAuditPageHref('invitations', 1)}
            aria-current={data.organizationAudit.audit.filter === 'invitations'
              ? 'page'
              : undefined}>Invitations</a
          >
          <a
            href={organizationAuditPageHref('members', 1)}
            aria-current={data.organizationAudit.audit.filter === 'members' ? 'page' : undefined}
            >Members</a
          >
        </nav>

        {#if data.organizationAudit.audit.events.length === 0}
          <div class="empty-state">
            <strong>No recorded changes on this page.</strong>
            <p>Try another filter or return to the first page.</p>
          </div>
        {:else}
          <ol class="audit-list">
            {#each data.organizationAudit.audit.events as event, index (`${event.occurredAt}-${event.action}-${index}`)}
              <li>
                <span class="event-mark" aria-hidden="true"></span>
                <div class="event-copy">
                  <strong>{organizationAuditActionLabel(event.action)}</strong>
                  <span>{formatTimestamp(event.occurredAt)}</span>
                </div>
                {#if event.role !== null}
                  <span class="role-mark">{event.role}</span>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}

        <nav class="pagination" aria-label="Organization history pages">
          {#if data.organizationAudit.audit.page > 1}
            <a
              rel="prev"
              href={organizationAuditPageHref(
                data.organizationAudit.audit.filter,
                data.organizationAudit.audit.page - 1
              )}>← Newer</a
            >
          {:else}
            <span></span>
          {/if}
          {#if data.organizationAudit.audit.hasMore}
            <a
              rel="next"
              href={organizationAuditPageHref(
                data.organizationAudit.audit.filter,
                data.organizationAudit.audit.page + 1
              )}>Older →</a
            >
          {/if}
        </nav>
      </section>
    {/if}
  </section>
</main>

<style>
  .account-shell {
    width: min(100% - 2rem, 76rem);
    margin: 0 auto;
    padding: 3rem 0 6rem;
  }

  .account-panel {
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    padding: clamp(1.25rem, 3vw, 2.5rem);
  }

  .back-link,
  .text-link {
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.76rem;
    text-decoration: none;
  }

  .back-link:hover,
  .text-link:hover,
  .organization-nav a:hover,
  .filter-nav a:hover,
  .pagination a:hover {
    text-decoration: underline;
  }

  .page-kicker,
  .section-kicker,
  .state-label {
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    margin: 2rem 0 0.5rem;
    text-transform: uppercase;
  }

  .account-title {
    font-size: clamp(2.5rem, 8vw, 5.5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
    margin: 0 0 1.5rem;
  }

  .audit-state,
  .audit-state-panel {
    border-top: 1px solid var(--line);
    margin-top: 2rem;
    padding-top: 2rem;
  }

  .audit-state {
    color: var(--ink-muted);
  }

  .workspace-heading,
  .history-heading {
    align-items: flex-start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }

  .workspace-heading h2,
  .history-heading h3 {
    font-size: clamp(1.45rem, 4vw, 2.4rem);
    margin: 0;
  }

  .workspace-heading .state-label,
  .history-heading .section-kicker {
    margin-top: 0;
  }

  .status-mark,
  .role-mark {
    border: 1px solid var(--signal);
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    padding: 0.3rem 0.5rem;
    text-transform: uppercase;
  }

  .status-mark.restricted {
    border-color: var(--warning);
    color: var(--warning);
  }

  .restriction {
    border-left: 2px solid var(--warning);
    color: var(--ink-muted);
    margin: 1.5rem 0 0;
    padding: 0.8rem 1rem;
  }

  .organization-nav,
  .filter-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .organization-nav {
    border-bottom: 1px solid var(--line);
    margin-top: 1.75rem;
    padding-bottom: 1rem;
  }

  .organization-nav a,
  .filter-nav a,
  .pagination a {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .organization-nav a[aria-current='page'],
  .filter-nav a[aria-current='page'] {
    color: var(--signal);
  }

  .history-heading {
    border-top: 1px solid var(--line);
    margin-top: 2.5rem;
    padding-top: 2rem;
  }

  .history-heading > span {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .filter-nav {
    margin: 1.5rem 0;
  }

  .filter-nav a {
    border: 1px solid var(--line);
    padding: 0.45rem 0.7rem;
  }

  .filter-nav a[aria-current='page'] {
    border-color: var(--signal);
  }

  .audit-list {
    border-top: 1px solid var(--line);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .audit-list li {
    align-items: center;
    border-bottom: 1px solid var(--line);
    display: grid;
    gap: 1rem;
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 1rem 0;
  }

  .event-mark {
    background: var(--signal);
    display: block;
    height: 0.45rem;
    width: 0.45rem;
  }

  .event-copy {
    display: grid;
    gap: 0.25rem;
  }

  .event-copy strong {
    font-size: 0.95rem;
  }

  .event-copy span,
  .empty-state p {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .role-mark {
    border-color: var(--line-strong);
    color: var(--ink-muted);
  }

  .empty-state {
    border: 1px solid var(--line);
    padding: 1.25rem;
  }

  .empty-state p {
    margin-bottom: 0;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    margin-top: 1.5rem;
    min-height: 1rem;
  }

  .pagination a {
    color: var(--signal);
  }

  @media (max-width: 40rem) {
    .account-shell {
      width: min(100% - 1rem, 76rem);
      padding-top: 1rem;
    }

    .account-panel {
      padding: 1rem;
    }

    .workspace-heading,
    .history-heading {
      display: grid;
    }

    .status-mark {
      justify-self: start;
    }

    .audit-list li {
      align-items: start;
      grid-template-columns: auto minmax(0, 1fr);
    }

    .role-mark {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
