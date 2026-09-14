<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>Organization invitation - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel invitation-panel" aria-labelledby="invitation-title">
    <p class="page-kicker">Organization access</p>
    <h1 id="invitation-title" class="account-title">Invitation.</h1>

    {#if data.invitation.status === 'ready'}
      <section class="invitation-state" aria-labelledby="ready-title">
        <p class="state-label">Verified account</p>
        <h2 id="ready-title">Join your organization workspace.</h2>
        <p>
          You are signed in with a verified identity. Accept this invitation to open the employee
          workspace.
        </p>
        <div class="invitation-actions">
          <form method="POST" action="?/accept">
            <button class="primary-action" type="submit">Accept invitation</button>
          </form>
          <form method="POST" action="?/reject">
            <button class="secondary-action" type="submit">Decline invitation</button>
          </form>
        </div>
      </section>
    {:else if data.invitation.status === 'verification-required'}
      <section class="invitation-state" aria-labelledby="verification-title">
        <p class="state-label">Verification required</p>
        <h2 id="verification-title">Verify your account first.</h2>
        <p>Organization invitations can only be accepted by verified identities.</p>
        <a class="text-link" href="/dashboard/">Return to dashboard</a>
      </section>
    {:else}
      <section class="invitation-state" aria-labelledby="invalid-title">
        <p class="state-label">Invitation unavailable</p>
        <h2 id="invalid-title">This invitation is no longer available.</h2>
        <p>The invitation may have expired, been revoked, or already been accepted.</p>
        <a class="text-link" href="/">Return to OMG</a>
      </section>
    {/if}

    {#if form?.kind === 'organization-invitation-error'}
      <p class="form-error" role="alert">{form.message}</p>
    {/if}
  </section>
</main>

<style>
  .invitation-panel {
    max-width: 42rem;
  }

  .invitation-state {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .state-label,
  .text-link {
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .state-label {
    margin: 0;
  }

  .invitation-state h2 {
    max-width: 34rem;
    margin: 0.55rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.75rem);
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .invitation-state p:not(.state-label, .form-error) {
    max-width: 34rem;
    margin: 1.25rem 0;
    color: var(--ink-muted);
    line-height: 1.65;
  }

  .invitation-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    margin-top: 1rem;
  }

  .primary-action,
  .secondary-action {
    padding: 0.9rem 1.25rem;
    border: 1px solid var(--signal);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .primary-action {
    background: var(--signal);
    color: var(--signal-ink);
  }

  .secondary-action {
    border-color: var(--rule-strong);
    background: transparent;
    color: var(--ink-muted);
  }

  .primary-action:hover,
  .primary-action:focus-visible,
  .secondary-action:hover,
  .secondary-action:focus-visible {
    border-color: var(--signal);
    background: transparent;
    color: var(--signal);
  }

  .text-link {
    display: inline-block;
    color: var(--ink-muted);
    text-decoration: none;
  }

  .text-link:hover,
  .text-link:focus-visible {
    color: var(--signal);
  }

  .form-error {
    margin: 2rem 0 0;
    padding: 0.9rem 1rem;
    border-left: 2px solid var(--signal);
    color: var(--ink);
    background: color-mix(in srgb, var(--signal) 8%, transparent);
  }
</style>
