<script lang="ts">
  import AccountWorkspaceNav from '../../../lib/components/AccountWorkspaceNav.svelte';
  import type { PageProps } from './$types';
  import { formatTimestamp } from '../dashboard-view';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Account machines - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel machines-panel" aria-labelledby="machines-title">
    <AccountWorkspaceNav active="machines" />

    <p class="page-kicker">Account / Machines</p>
    <h1 id="machines-title" class="account-title">Active machines.</h1>

    {#if data.machines.status === 'verification-required'}
      <p class="machine-state">Verify your email to access machine data.</p>
    {:else if data.machines.status === 'unavailable'}
      <p class="machine-state" role="status">Machine data is temporarily unavailable.</p>
    {:else}
      <p class="machine-count">
        {data.machines.machines.active} of {data.machines.machines.allowance} active
      </p>
      {#if data.machines.machines.machines.length === 0}
        <p class="machine-state">No active machines have reported to this license.</p>
      {:else}
        <ul class="machine-list">
          {#each data.machines.machines.machines as machine (machine)}
            <li>
              <header>
                <h2>{machine.hostname ?? 'Unnamed machine'}</h2>
                <span>Last seen {formatTimestamp(machine.lastSeenAt)}</span>
              </header>
              <dl>
                <div>
                  <dt>Operating system</dt>
                  <dd>{machine.operatingSystem ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>Architecture</dt>
                  <dd>{machine.architecture ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>OMG version</dt>
                  <dd>{machine.version ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>First seen</dt>
                  <dd>{formatTimestamp(machine.firstSeenAt)}</dd>
                </div>
              </dl>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </section>
</main>

<style>
  .machines-panel {
    max-width: 58rem;
  }
  .machine-state,
  .machine-count {
    margin-top: 2rem;
    color: var(--ink-muted);
  }
  .machine-count {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
  .machine-list {
    margin: 2rem 0 0;
    padding: 0;
    list-style: none;
  }
  .machine-list > li {
    padding: 1.5rem 0;
    border-top: 1px solid var(--rule);
  }
  .machine-list header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: baseline;
    justify-content: space-between;
  }
  .machine-list h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    letter-spacing: -0.03em;
  }
  .machine-list header span,
  .machine-list dt {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  .machine-list dl {
    display: grid;
    gap: 1rem 2rem;
    margin: 1.5rem 0 0;
  }
  .machine-list dd {
    margin: 0.35rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  @media (min-width: 40rem) {
    .machine-list dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
