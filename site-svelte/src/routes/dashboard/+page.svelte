<script lang="ts">
  import { authClient } from '../../lib/auth-client';
  import type { PageData } from './$types';
  import {
    formatProductLabel,
    formatTimestamp,
    machineAllowanceLabel,
    providerLabel,
    verificationLabel,
  } from './dashboard-view';

  let { data }: { data: PageData } = $props();
  let pending = $state(false);

  async function signOut(): Promise<void> {
    pending = true;
    try {
      await authClient.signOut();
    } finally {
      window.location.assign('/');
    }
  }
</script>

<svelte:head>
  <title>Dashboard - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel dashboard-panel" aria-labelledby="dashboard-title">
    <p class="page-kicker">Account</p>
    <h1 id="dashboard-title" class="account-title">Account overview.</h1>

    <dl class="dashboard-facts">
      <div class="dashboard-fact">
        <dt>Name</dt>
        <dd>{data.user.name}</dd>
      </div>
      <div class="dashboard-fact">
        <dt>Signed in as</dt>
        <dd class="dashboard-mono">{data.user.email}</dd>
      </div>
      <div class="dashboard-fact">
        <dt>Email status</dt>
        <dd>{verificationLabel(data.user.emailVerified)}</dd>
      </div>
      <div class="dashboard-fact">
        <dt>Account created</dt>
        <dd>{formatTimestamp(data.user.createdAt)}</dd>
      </div>
      <div class="dashboard-fact">
        <dt>Current session expires</dt>
        <dd>{formatTimestamp(data.currentSessionExpiresAt)}</dd>
      </div>
    </dl>

    <section class="dashboard-section" aria-labelledby="license-title">
      <h2 id="license-title">License</h2>
      {#if data.licensing.status === 'available'}
        <dl class="dashboard-facts licensing-facts">
          <div class="dashboard-fact">
            <dt>Plan</dt>
            <dd>{formatProductLabel(data.licensing.summary.tier)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>License status</dt>
            <dd>{formatProductLabel(data.licensing.summary.status)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>Active machines</dt>
            <dd>
              {machineAllowanceLabel(
                data.licensing.summary.activeMachines,
                data.licensing.summary.maxMachines
              )}
            </dd>
          </div>
          <div class="dashboard-fact">
            <dt>License expires</dt>
            <dd>{formatTimestamp(data.licensing.summary.expiresAt)}</dd>
          </div>
          {#if data.licensing.summary.subscription !== null}
            <div class="dashboard-fact">
              <dt>Subscription</dt>
              <dd>{formatProductLabel(data.licensing.summary.subscription.status)}</dd>
            </div>
            <div class="dashboard-fact">
              <dt>Current period ends</dt>
              <dd>{formatTimestamp(data.licensing.summary.subscription.periodEnd)}</dd>
            </div>
            <div class="dashboard-fact">
              <dt>Renewal</dt>
              <dd>
                {data.licensing.summary.subscription.cancelAtPeriodEnd
                  ? 'Ends after current period'
                  : 'Continues'}
              </dd>
            </div>
          {/if}
        </dl>
      {:else if data.licensing.status === 'verification-required'}
        <p class="dashboard-empty">Verify your email to access licensing data.</p>
      {:else}
        <p class="dashboard-empty">
          Licensing data is temporarily unavailable. Account and session records remain current.
        </p>
      {/if}
    </section>

    <section class="dashboard-section" aria-labelledby="identities-title">
      <h2 id="identities-title">Connected identities</h2>
      {#if data.accounts.length === 0}
        <p class="dashboard-empty">No connected identity is available.</p>
      {:else}
        <ul class="identity-list">
          {#each data.accounts as account (`${account.provider}:${account.accountId}`)}
            <li>{providerLabel(account.provider)}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="dashboard-section" aria-labelledby="sessions-title">
      <h2 id="sessions-title">Sessions</h2>
      {#if data.sessions.length === 0}
        <p class="dashboard-empty">No session rows are available.</p>
      {:else}
        <ul class="session-list">
          {#each data.sessions as session (session.id)}
            <li>
              <header>
                <strong>{session.isCurrent ? 'Current session' : 'Other session'}</strong>
                <span>{formatTimestamp(session.expiresAt)}</span>
              </header>
              <dl>
                <div>
                  <dt>Client</dt>
                  <dd>{session.userAgent ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>IP address</dt>
                  <dd class="dashboard-mono">{session.ipAddress ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{formatTimestamp(session.createdAt)}</dd>
                </div>
              </dl>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <button
      type="button"
      class="dashboard-signout"
      onclick={() => void signOut()}
      disabled={pending}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  </section>
</main>

<style>
  .dashboard-panel {
    max-width: 52rem;
  }

  .dashboard-facts {
    display: grid;
    gap: 1.25rem 2rem;
    margin: 2.5rem 0 0;
  }

  .licensing-facts {
    margin-top: 1.5rem;
  }

  .dashboard-fact dt,
  .session-list dt {
    margin-bottom: 0.35rem;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .dashboard-fact dd,
  .session-list dd {
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  .dashboard-mono {
    font-family: var(--font-mono);
  }

  .dashboard-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .dashboard-section h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: -0.04em;
  }

  .identity-list,
  .session-list {
    margin: 1.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .identity-list li {
    padding-block: 1rem;
    border-top: 1px solid var(--rule);
  }

  .dashboard-empty,
  .session-list header span {
    color: var(--ink-muted);
    font-size: 0.8rem;
  }

  .session-list > li {
    padding-block: 1.5rem;
    border-top: 1px solid var(--rule);
  }

  .session-list header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .session-list dl {
    display: grid;
    gap: 1rem 2rem;
    margin: 1.25rem 0 0;
  }

  .dashboard-empty {
    margin: 1.5rem 0 0;
  }

  .dashboard-signout {
    margin-top: 3rem;
    padding: 0.9rem 1.25rem;
    border: 1px solid var(--signal);
    background: var(--signal);
    color: var(--signal-ink);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .dashboard-signout:hover:not(:disabled) {
    background: var(--signal-hover);
  }

  .dashboard-signout:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (min-width: 40rem) {
    .dashboard-facts,
    .session-list dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
