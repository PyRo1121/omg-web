<script lang="ts">
  import { authClient } from '../../../lib/auth-client';
  import AccountWorkspaceNav from '../../../lib/components/AccountWorkspaceNav.svelte';
  import type { PageProps } from './$types';
  import { formatTimestamp, providerLabel, verificationLabel } from '../dashboard-view';

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
  <title>Account settings - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel settings-panel" aria-labelledby="settings-title">
    <AccountWorkspaceNav active="settings" />

    <p class="page-kicker">Account / Settings</p>
    <h1 id="settings-title" class="account-title">Account settings.</h1>

    <dl class="settings-facts">
      <div>
        <dt>Name</dt>
        <dd>{data.dashboard.user.name}</dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>{data.dashboard.user.email}</dd>
      </div>
      <div>
        <dt>Email status</dt>
        <dd>{verificationLabel(data.dashboard.user.emailVerified)}</dd>
      </div>
      <div>
        <dt>Account created</dt>
        <dd>{formatTimestamp(data.dashboard.user.createdAt)}</dd>
      </div>
    </dl>

    <section class="settings-section" aria-labelledby="identities-title">
      <h2 id="identities-title">Connected identities</h2>
      {#if data.dashboard.accounts.length === 0}
        <p class="settings-state">No connected identity is available.</p>
      {:else}
        <ul class="plain-list">
          {#each data.dashboard.accounts as account (account)}
            <li>{providerLabel(account.provider)}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="settings-section" aria-labelledby="sessions-title">
      <h2 id="sessions-title">Sessions</h2>
      {#if data.dashboard.sessions.length === 0}
        <p class="settings-state">No session rows are available.</p>
      {:else}
        <ul class="session-list">
          {#each data.dashboard.sessions as session (session)}
            <li>
              <header>
                <strong>{session.isCurrent ? 'Current session' : 'Other session'}</strong><span
                  >Expires {formatTimestamp(session.expiresAt)}</span
                >
              </header>
              <dl>
                <div>
                  <dt>Client</dt>
                  <dd>{session.userAgent ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>IP address</dt>
                  <dd>{session.ipAddress ?? 'Unavailable'}</dd>
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

    <section class="settings-section" aria-labelledby="billing-title">
      <h2 id="billing-title">Billing</h2>
      <p class="settings-state">
        Manage payment methods, invoices, and subscriptions securely with Stripe.
      </p>
      {#if form?.kind === 'portal-error'}
        <p class="settings-error" role="alert">{form.message}</p>
      {/if}
      <form method="POST" action="?/openBillingPortal">
        <button type="submit" class="secondary-action">Open billing settings</button>
      </form>
    </section>

    <section class="settings-section" aria-labelledby="signout-title">
      <h2 id="signout-title">Browser session</h2>
      <button
        type="button"
        class="primary-action"
        onclick={() => void signOut()}
        disabled={pending}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  </section>
</main>

<style>
  .settings-panel {
    max-width: 58rem;
  }
  .settings-facts {
    display: grid;
    gap: 1rem 2rem;
    margin: 2.5rem 0 0;
  }
  dt {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  dd {
    margin: 0.35rem 0 0;
    overflow-wrap: anywhere;
  }
  .settings-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }
  .settings-section h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: -0.04em;
  }
  .settings-state {
    margin-top: 1rem;
    color: var(--ink-muted);
    line-height: 1.6;
  }
  .settings-error {
    margin-top: 1rem;
    color: var(--danger);
  }
  .plain-list,
  .session-list {
    margin: 1.5rem 0 0;
    padding: 0;
    list-style: none;
  }
  .plain-list li,
  .session-list > li {
    padding: 1rem 0;
    border-top: 1px solid var(--rule);
  }
  .session-list header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    justify-content: space-between;
  }
  .session-list header span {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  .session-list dl {
    display: grid;
    gap: 1rem 2rem;
    margin: 1.25rem 0 0;
  }
  .settings-section form {
    margin-top: 1.25rem;
  }
  .secondary-action,
  .primary-action {
    min-height: 2.75rem;
    padding: 0.75rem 1rem;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }
  .secondary-action {
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--ink);
  }
  .primary-action {
    margin-top: 1.25rem;
    border: 1px solid var(--signal);
    background: var(--signal);
    color: var(--signal-ink);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @media (min-width: 40rem) {
    .settings-facts,
    .session-list dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
