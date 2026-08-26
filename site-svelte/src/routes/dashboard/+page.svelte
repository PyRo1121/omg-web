<script lang="ts">
  import { authClient } from '../../lib/auth-client';
  import type { PageData } from './$types';
  import { formatExpiry, verificationLabel } from './dashboard-view';

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
  <section class="account-panel" aria-labelledby="dashboard-title">
    <p class="page-kicker">Account</p>
    <h1 id="dashboard-title" class="account-title">Session overview.</h1>

    <dl class="dashboard-facts">
      <div class="dashboard-fact">
        <dt>Signed in as</dt>
        <dd class="dashboard-mono">{data.user.email}</dd>
      </div>
      <div class="dashboard-fact">
        <dt>Email status</dt>
        <dd>{verificationLabel(data.user.emailVerified)}</dd>
      </div>
      <div class="dashboard-fact">
        <dt>Session expires</dt>
        <dd>{formatExpiry(data.session.expiresAt)}</dd>
      </div>
    </dl>

    <button
      type="button"
      class="dashboard-signout"
      onclick={() => void signOut()}
      disabled={pending}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>

    <p class="account-note">
      Dashboard telemetry is not yet migrated. This shell shows only what the shadow session can
      truthfully report.
    </p>
  </section>
</main>

<style>
  .dashboard-facts {
    display: grid;
    gap: 1.25rem;
    margin: 2rem 0;
  }

  .dashboard-fact dt {
    margin-bottom: 0.35rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .dashboard-fact dd {
    margin: 0;
    font-size: 0.9375rem;
  }

  .dashboard-mono {
    font-family: var(--font-mono);
  }

  .dashboard-signout {
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
    opacity: 0.85;
  }

  .dashboard-signout:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
