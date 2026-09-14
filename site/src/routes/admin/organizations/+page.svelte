<script lang="ts">
  import { formatTimestamp } from '../../dashboard/dashboard-view';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<svelte:head
  ><title>Organizations - OMG Control Center</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>

<main id="main-content" class="directory-shell">
  <header>
    <div>
      <p>Operator / Organizations</p>
      <h1>Organization directory.</h1>
    </div>
    <span>{data.operatorName}</span>
  </header>

  <form method="GET" class="search-form">
    <label for="organization-search">Search name, slug, or member email</label>
    <div>
      <input id="organization-search" name="q" value={data.search} maxlength="100" /><button
        type="submit">Search</button
      >
    </div>
  </form>

  <p class="result-count">
    {data.directory.pagination.total} organizations · page {data.directory.pagination.page}
  </p>
  {#if data.directory.organizations.length === 0}
    <p class="empty-state">No organizations match this search.</p>
  {:else}
    <div class="table-scroll" role="region" aria-label="Organization support directory">
      <table>
        <thead
          ><tr
            ><th>Organization</th><th>Entitlement</th><th>Seats</th><th>Invites</th><th>Machines</th
            ><th>Last audit</th><th><span class="visually-hidden">Support</span></th></tr
          ></thead
        >
        <tbody>
          {#each data.directory.organizations as organization (organization.slug)}
            <tr>
              <th scope="row"
                ><strong>{organization.name}</strong><span>{organization.slug}</span></th
              >
              <td>{organization.tier} · {organization.status}</td>
              <td>{organization.seatsUsed} / {organization.seatLimit ?? 'unavailable'}</td>
              <td>{organization.pendingInvitations}</td>
              <td>{organization.activeMachines}</td>
              <td>{formatTimestamp(organization.lastAuditAt)}</td>
              <td
                ><a
                  class="support-link"
                  href={`/admin/organizations/support/?slug=${organization.slug}`}>Open support →</a
                ></td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</main>

<style>
  .directory-shell {
    padding: clamp(1rem, 4vw, 3rem);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 2rem;
    border-bottom: 1px solid var(--rule-strong);
    padding-bottom: 1.5rem;
  }
  header p,
  header span,
  .result-count,
  label,
  th span {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--ink-muted);
  }
  h1 {
    margin: 0.3rem 0 0;
    font-size: clamp(2rem, 6vw, 4.5rem);
    letter-spacing: -0.06em;
  }
  .search-form {
    margin: 2rem 0;
    max-width: 42rem;
  }
  .search-form label {
    display: block;
    margin-bottom: 0.5rem;
  }
  .search-form div {
    display: grid;
    grid-template-columns: 1fr auto;
  }
  input,
  button {
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
    color: var(--ink);
    padding: 0.8rem;
    font: inherit;
  }
  button {
    background: var(--signal);
    color: var(--signal-ink);
    cursor: pointer;
  }
  .table-scroll {
    overflow-x: auto;
    border: 1px solid var(--rule-strong);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 58rem;
  }
  th,
  td {
    padding: 0.9rem;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    vertical-align: top;
  }
  thead th {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--ink-muted);
    text-transform: uppercase;
  }
  tbody th strong,
  tbody th span {
    display: block;
  }
  tbody th span {
    margin-top: 0.25rem;
  }
  .support-link {
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .empty-state {
    border: 1px solid var(--rule);
    padding: 1.5rem;
    color: var(--ink-muted);
  }
  @media (max-width: 40rem) {
    .directory-shell {
      padding: 1rem;
    }
    header {
      display: grid;
    }
  }
</style>
