<script lang="ts">
  import { formatProductLabel } from '../dashboard-view';
  import AccountWorkspaceNav from '../../../lib/components/AccountWorkspaceNav.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let showOrganization = $derived(
    data.organization.status === 'eligible' ||
      data.organization.status === 'active' ||
      data.organization.status === 'restricted'
  );
</script>

<svelte:head>
  <title>Organization - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel organization-panel" aria-labelledby="organization-title">
    <a class="back-link" href="/dashboard/">← Account overview</a>
    <p class="page-kicker">Team workspace</p>
    <h1 id="organization-title" class="account-title">Organization.</h1>

    <AccountWorkspaceNav active="organization" {showOrganization} />

    {#if data.organization.status === 'verification-required'}
      <p class="organization-message">
        Verify your email before opening an organization workspace.
      </p>
    {:else if data.organization.status === 'individual'}
      <section class="organization-state" aria-labelledby="individual-title">
        <p class="state-label">
          {data.organization.tier === null
            ? 'Individual'
            : formatProductLabel(data.organization.tier)} account
        </p>
        <h2 id="individual-title">Built for your own machines.</h2>
        <p>
          Your analytics, achievements, machine fleet, and settings remain available. Employee
          membership starts with Team.
        </p>
        <a class="text-link" href="/#pricing">Compare Team plans</a>
      </section>
    {:else if data.organization.status === 'eligible'}
      <section class="organization-state" aria-labelledby="create-title">
        <p class="state-label">
          {formatProductLabel(data.organization.tier)} · {data.organization.maxSeats} seats
        </p>
        <h2 id="create-title">Name your workspace.</h2>
        <p>Create one organization for the employees covered by this subscription.</p>

        {#if form?.kind === 'organization-error'}
          <p class="form-error" role="alert">{form.message}</p>
        {/if}

        <form method="POST" action="?/createOrganization" class="organization-form">
          <label>
            <span>Workspace name</span>
            <input
              name="name"
              type="text"
              minlength="2"
              maxlength="80"
              autocomplete="organization"
              placeholder="Acme Engineering"
              required
            />
          </label>
          <label>
            <span>URL slug</span>
            <input
              name="slug"
              type="text"
              minlength="3"
              maxlength="48"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              autocomplete="off"
              placeholder="acme-engineering"
              required
            />
          </label>
          <p class="form-hint">Lowercase letters, numbers, and single hyphens only.</p>
          <button type="submit">Create organization</button>
        </form>
      </section>
    {:else if data.organization.status === 'active' || data.organization.status === 'restricted'}
      <section class="organization-state" aria-labelledby="workspace-title">
        <div class="workspace-heading">
          <div>
            <p class="state-label">
              {data.organization.organization.tier === null
                ? 'Plan unavailable'
                : formatProductLabel(data.organization.organization.tier)}
              · {data.organization.organization.role}
            </p>
            <h2 id="workspace-title">{data.organization.organization.name}</h2>
          </div>
          <span
            class={data.organization.status === 'restricted'
              ? 'status-mark restricted'
              : 'status-mark'}
          >
            {data.organization.status}
          </span>
        </div>

        {#if data.organization.status === 'restricted'}
          <p class="restriction" role="status">
            Membership growth is paused. Existing organization details remain available while the
            subscription is resolved.
          </p>
        {/if}

        <nav class="workspace-links" aria-label="Organization workspace">
          <a class="text-link" href="/dashboard/organization/members/">
            Review people and invitations
          </a>
          <a class="text-link" href="/dashboard/organization/usage/">Review usage and fleet</a>
        </nav>

        <dl class="organization-facts">
          <div>
            <dt>Seats in use</dt>
            <dd>
              {data.organization.organization.maxSeats === null
                ? `${data.organization.organization.usedSeats} / unavailable`
                : `${data.organization.organization.usedSeats} / ${data.organization.organization.maxSeats}`}
            </dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{data.organization.organization.role}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd class="mono">{data.organization.organization.slug}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>
              {data.organization.organization.tier === null
                ? 'Unavailable'
                : formatProductLabel(data.organization.organization.tier)}
            </dd>
          </div>
        </dl>
      </section>
    {:else}
      <p class="organization-message">
        Organization details are temporarily unavailable. Your individual account tools still work.
      </p>
    {/if}
  </section>
</main>

<style>
  .organization-panel {
    max-width: 52rem;
  }

  .back-link,
  .text-link {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .back-link:hover,
  .text-link:hover {
    color: var(--signal);
  }

  .page-kicker {
    margin-top: 2.5rem;
  }

  .organization-state,
  .organization-message {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .organization-state h2 {
    max-width: 40rem;
    margin: 0.55rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.75rem);
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .organization-state > p:not(.state-label, .form-error, .form-hint, .restriction) {
    max-width: 38rem;
    margin: 1.25rem 0;
    color: var(--ink-muted);
    line-height: 1.65;
  }

  .state-label {
    margin: 0;
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .organization-form {
    display: grid;
    gap: 1.25rem;
    max-width: 35rem;
    margin-top: 2rem;
  }

  .organization-form label {
    display: grid;
    gap: 0.5rem;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .organization-form input {
    min-width: 0;
    padding: 0.9rem 1rem;
    border: 1px solid var(--rule-strong);
    border-radius: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 0.875rem;
  }

  .organization-form input:focus {
    border-color: var(--signal);
    outline: 2px solid color-mix(in srgb, var(--signal) 24%, transparent);
    outline-offset: 2px;
  }

  .form-hint {
    margin: -0.5rem 0 0;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .form-error,
  .restriction {
    margin: 1.5rem 0 0;
    padding: 0.9rem 1rem;
    border-left: 2px solid var(--signal);
    background: color-mix(in srgb, var(--signal) 8%, transparent);
  }

  .organization-form button {
    width: fit-content;
    padding: 0.9rem 1.25rem;
    border: 1px solid var(--signal);
    background: var(--signal);
    color: var(--signal-ink);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .organization-form button:hover {
    background: var(--signal-hover);
  }

  .workspace-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    align-items: flex-start;
    justify-content: space-between;
  }

  .status-mark {
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--rule-strong);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-mark.restricted {
    border-color: var(--signal);
    color: var(--signal);
  }

  .workspace-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 2rem;
  }

  .organization-facts {
    display: grid;
    gap: 1.25rem 2rem;
    margin: 2.5rem 0 0;
  }

  .organization-facts div {
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
  }

  .organization-facts dt {
    color: var(--ink-muted);
    font-size: 0.72rem;
  }

  .organization-facts dd {
    margin: 0.4rem 0 0;
    font-size: 1rem;
    text-transform: capitalize;
  }

  .mono {
    font-family: var(--font-mono);
    text-transform: none !important;
  }

  @media (min-width: 40rem) {
    .organization-facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
