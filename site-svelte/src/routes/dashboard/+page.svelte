<script lang="ts">
  import { authClient } from '../../lib/auth-client';
  import type { PageProps } from './$types';
  import {
    formatCount,
    formatDuration,
    formatProductLabel,
    formatTimestamp,
    machineAllowanceLabel,
    providerLabel,
    streakLabel,
    verificationLabel,
  } from './dashboard-view';

  let { data, form }: PageProps = $props();
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

    <nav class="workspace-nav" aria-label="Account workspace">
      <a href="/dashboard/" aria-current="page">Overview</a>
      <a href="/dashboard/analytics/">Analytics</a>
      <a href="/dashboard/achievements/">Achievements</a>
    </nav>

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

    {#if data.licensing.status === 'available' && data.licensing.summary.isAdmin}
      <a class="dashboard-admin-link" href="/admin/">
        <span>Admin overview</span>
        <small>Users, activity, fleet, and billing state</small>
      </a>
    {/if}

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

    <section class="dashboard-section billing-section" aria-labelledby="billing-title">
      <h2 id="billing-title">Billing</h2>
      <p>Manage payment methods, invoices, and subscription changes securely with Stripe.</p>
      {#if form?.kind === 'portal-error'}
        <p class="billing-error" role="alert">{form.message}</p>
      {/if}
      <form method="POST" action="?/openBillingPortal" class="billing-form">
        <button type="submit">Open billing settings</button>
      </form>
    </section>

    {#if data.licensing.status === 'available'}
      <section class="dashboard-section" aria-labelledby="usage-title">
        <h2 id="usage-title" class="dashboard-section-heading">
          <span>Usage</span>
          <small>Last 30 days</small>
        </h2>
        <dl class="dashboard-facts licensing-facts">
          <div class="dashboard-fact">
            <dt>Commands</dt>
            <dd>{formatCount(data.licensing.summary.usage.totalCommands)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>Packages installed</dt>
            <dd>{formatCount(data.licensing.summary.usage.packagesInstalled)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>Runtime switches</dt>
            <dd>{formatCount(data.licensing.summary.usage.runtimeSwitches)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>Time saved</dt>
            <dd>{formatDuration(data.licensing.summary.usage.timeSavedMs)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>Current streak</dt>
            <dd>{streakLabel(data.licensing.summary.usage.currentStreak)}</dd>
          </div>
          <div class="dashboard-fact">
            <dt>Top package</dt>
            <dd class="dashboard-mono">
              {data.licensing.summary.usage.topPackage ?? 'Unavailable'}
            </dd>
          </div>
          <div class="dashboard-fact">
            <dt>Top runtime</dt>
            <dd class="dashboard-mono">
              {data.licensing.summary.usage.topRuntime ?? 'Unavailable'}
            </dd>
          </div>
        </dl>
      </section>
    {/if}

    {#if data.licensing.status === 'available'}
      <section class="dashboard-section" aria-labelledby="machines-title">
        <h2 id="machines-title" class="dashboard-section-heading">
          <span>Machines</span>
          <small>{formatCount(data.licensing.summary.activeMachines)} active</small>
        </h2>
        {#if data.licensing.summary.machines.length === 0}
          <p class="dashboard-empty">No active machines have reported to this license.</p>
        {:else}
          <ul class="machine-list">
            {#each data.licensing.summary.machines as machine, index (index)}
              <li>
                <header>
                  <strong>{machine.hostname ?? 'Unnamed machine'}</strong>
                  <span>Last seen {formatTimestamp(machine.lastSeenAt)}</span>
                </header>
                <dl>
                  <div>
                    <dt>Operating system</dt>
                    <dd>{machine.operatingSystem ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Architecture</dt>
                    <dd class="dashboard-mono">{machine.architecture ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>OMG version</dt>
                    <dd class="dashboard-mono">{machine.version ?? 'Unavailable'}</dd>
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
      </section>
    {/if}

    <section class="dashboard-section" aria-labelledby="identities-title">
      <h2 id="identities-title">Connected identities</h2>
      {#if data.accounts.length === 0}
        <p class="dashboard-empty">No connected identity is available.</p>
      {:else}
        <ul class="identity-list">
          {#each data.accounts as account (account)}
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
          {#each data.sessions as session (session)}
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

  .workspace-nav {
    display: flex;
    gap: 1.25rem;
    margin-top: 2rem;
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

  .dashboard-facts {
    display: grid;
    gap: 1.25rem 2rem;
    margin: 2.5rem 0 0;
  }

  .licensing-facts {
    margin-top: 1.5rem;
  }

  .dashboard-fact dt,
  .machine-list dt,
  .session-list dt {
    margin-bottom: 0.35rem;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .dashboard-fact dd,
  .machine-list dd,
  .session-list dd {
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  .dashboard-mono {
    font-family: var(--font-mono);
  }

  .dashboard-admin-link {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 2.5rem;
    padding: 1rem 0;
    border-block: 1px solid var(--rule-strong);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    text-decoration: none;
  }

  .dashboard-admin-link small {
    color: var(--ink-muted);
    font-size: 0.68rem;
  }

  .dashboard-admin-link:hover,
  .dashboard-admin-link:hover small {
    color: var(--signal);
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

  .dashboard-section-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .dashboard-section-heading small {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .identity-list,
  .machine-list,
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
  .machine-list header span,
  .session-list header span {
    color: var(--ink-muted);
    font-size: 0.8rem;
  }

  .machine-list > li,
  .session-list > li {
    padding-block: 1.5rem;
    border-top: 1px solid var(--rule);
  }

  .machine-list header,
  .session-list header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .machine-list dl,
  .session-list dl {
    display: grid;
    gap: 1rem 2rem;
    margin: 1.25rem 0 0;
  }

  .dashboard-empty {
    margin: 1.5rem 0 0;
  }

  .billing-section > p {
    max-width: 42rem;
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    line-height: 1.6;
  }

  .billing-section .billing-error {
    color: var(--danger);
  }

  .billing-form {
    margin-top: 1.25rem;
  }

  .billing-form button {
    min-height: 2.75rem;
    padding-inline: 1rem;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }

  .billing-form button:hover {
    border-color: var(--signal);
    color: var(--signal);
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
    .machine-list dl,
    .session-list dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
