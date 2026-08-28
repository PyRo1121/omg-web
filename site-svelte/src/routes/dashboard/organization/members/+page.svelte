<script lang="ts">
  import AccountWorkspaceNav from '../../../../lib/components/AccountWorkspaceNav.svelte';
  import { formatProductLabel, formatTimestamp } from '../../dashboard-view';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let showOrganization = $derived(
    data.organization.status === 'active' || data.organization.status === 'restricted'
  );
</script>

<svelte:head>
  <title>Organization members - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel members-panel" aria-labelledby="members-title">
    <a class="back-link" href="/dashboard/organization/">← Organization overview</a>
    <p class="page-kicker">Employee access</p>
    <h1 id="members-title" class="account-title">Members.</h1>

    <AccountWorkspaceNav active="organization" {showOrganization} />

    {#if data.organization.status === 'verification-required'}
      <p class="members-message">Verify your email before opening organization membership.</p>
    {:else if data.organization.status === 'no-organization'}
      <section class="members-state" aria-labelledby="no-workspace-title">
        <p class="state-label">No organization</p>
        <h2 id="no-workspace-title">Start with the workspace overview.</h2>
        <p>Create an eligible Team or Enterprise workspace before managing employee membership.</p>
        <a class="text-link" href="/dashboard/organization/">Open organization overview</a>
      </section>
    {:else if data.organization.status === 'unavailable'}
      <p class="members-message">
        Membership details are temporarily unavailable. Try again later.
      </p>
    {:else if data.organization.status === 'active' || data.organization.status === 'restricted'}
      <section class="members-state" aria-labelledby="workspace-title">
        <div class="workspace-heading">
          <div>
            <p class="state-label">
              {data.organization.status === 'restricted' ? 'Restricted workspace' : 'Organization'}
              · {formatProductLabel(data.organization.organization.tier ?? 'unavailable')}
            </p>
            <h2 id="workspace-title">{data.organization.organization.name}</h2>
          </div>
          <a class="text-link" href="/dashboard/organization/">Overview</a>
        </div>

        {#if data.organization.status === 'restricted'}
          <p class="restriction" role="status">
            Membership changes are paused while the subscription is resolved. Existing roster and
            invitation details remain available.
          </p>
        {/if}

        <section class="members-section" aria-labelledby="people-title">
          <div class="section-heading">
            <h3 id="people-title">People</h3>
            <span>{data.organization.members.length} shown</span>
          </div>
          {#if data.organization.members.length === 0}
            <p class="empty-state">No accepted members were found.</p>
          {:else}
            <ul class="member-list">
              {#each data.organization.members as member (member.email)}
                <li>
                  <div>
                    <strong>{member.name}</strong>
                    <span class="member-email">{member.email}</span>
                  </div>
                  <div class="member-meta">
                    <span>{member.role}</span>
                    <span>Joined {formatTimestamp(member.joinedAt)}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
          {#if data.organization.hasMoreMembers}
            <p class="bounded-note">Showing the first 100 members.</p>
          {/if}
        </section>

        <section class="members-section" aria-labelledby="invitations-title">
          <div class="section-heading">
            <h3 id="invitations-title">Pending invitations</h3>
            <span>{data.organization.invitations.length} shown</span>
          </div>
          {#if data.organization.invitations.length === 0}
            <p class="empty-state">No pending invitations.</p>
          {:else}
            <ul class="member-list invitation-list">
              {#each data.organization.invitations as invitation (invitation.email)}
                <li>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span class="member-email">{invitation.role} access</span>
                  </div>
                  <div class="member-meta">
                    <span class={invitation.status === 'expired' ? 'expired' : ''}>
                      {invitation.status}
                    </span>
                    <span>Expires {formatTimestamp(invitation.expiresAt)}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
          {#if data.organization.hasMoreInvitations}
            <p class="bounded-note">Showing the first 100 invitations.</p>
          {/if}
        </section>
      </section>
    {/if}
  </section>
</main>

<style>
  .members-panel {
    max-width: 58rem;
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

  .members-state,
  .members-message {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .members-state h2 {
    max-width: 40rem;
    margin: 0.55rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.75rem);
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .members-state > p:not(.state-label, .restriction, .bounded-note) {
    max-width: 40rem;
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

  .workspace-heading,
  .section-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .section-heading span {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .restriction {
    margin: 1.75rem 0 0;
    padding: 0.9rem 1rem;
    border-left: 2px solid var(--signal);
    background: color-mix(in srgb, var(--signal) 8%, transparent);
  }

  .members-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .members-section h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.45rem;
    letter-spacing: -0.04em;
  }

  .member-list {
    display: grid;
    gap: 0;
    margin: 1.25rem 0 0;
    padding: 0;
    border-top: 1px solid var(--rule-strong);
    list-style: none;
  }

  .member-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 0;
    border-bottom: 1px solid var(--rule);
  }

  .member-list strong,
  .member-email {
    display: block;
  }

  .member-list strong {
    font-size: 0.95rem;
  }

  .member-email,
  .member-meta,
  .empty-state,
  .bounded-note {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .member-email {
    margin-top: 0.3rem;
    overflow-wrap: anywhere;
  }

  .member-meta {
    display: grid;
    gap: 0.3rem;
    text-align: right;
  }

  .member-meta span:first-child {
    color: var(--ink);
    text-transform: capitalize;
  }

  .member-meta .expired {
    color: var(--signal);
  }

  .empty-state,
  .bounded-note {
    margin: 1.25rem 0 0;
  }

  @media (max-width: 39.99rem) {
    .member-meta {
      width: 100%;
      text-align: left;
    }
  }
</style>
