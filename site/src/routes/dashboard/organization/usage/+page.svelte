<script lang="ts">
  import AccountWorkspaceNav from '../../../../lib/components/AccountWorkspaceNav.svelte';
  import { formatCount, formatDuration, formatProductLabel } from '../../dashboard-view';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let showOrganization = $derived(data.organizationUsage.status === 'available');
</script>

<svelte:head>
  <title>Organization usage - OMG Package Manager</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="account-shell">
  <section class="account-panel usage-panel" aria-labelledby="usage-title">
    <a class="back-link" href="/dashboard/organization/">← Organization overview</a>
    <p class="page-kicker">Organization intelligence</p>
    <h1 id="usage-title" class="account-title">Usage.</h1>

    <AccountWorkspaceNav active="organization" {showOrganization} />

    {#if data.organizationUsage.status === 'verification-required'}
      <p class="usage-state">Verify your email before opening organization usage.</p>
    {:else if data.organizationUsage.status === 'no-organization'}
      <section class="usage-state-panel" aria-labelledby="no-organization-title">
        <p class="state-label">No organization</p>
        <h2 id="no-organization-title">Start with the workspace overview.</h2>
        <p>Create or join an eligible organization before reviewing shared usage.</p>
        <a class="text-link" href="/dashboard/organization/">Open organization overview</a>
      </section>
    {:else if data.organizationUsage.status === 'unavailable'}
      <p class="usage-state" role="status">
        Organization usage is temporarily unavailable. Individual account tools still work.
      </p>
    {:else}
      <section class="usage-state-panel" aria-labelledby="organization-name">
        <div class="workspace-heading">
          <div>
            <p class="state-label">
              {data.organizationUsage.usage.organization.tier === null
                ? 'Plan unavailable'
                : formatProductLabel(data.organizationUsage.usage.organization.tier)}
              · {data.organizationUsage.usage.organization.role}
            </p>
            <h2 id="organization-name">{data.organizationUsage.usage.organization.name}</h2>
          </div>
          <span
            class={data.organizationUsage.usage.organization.status === 'restricted'
              ? 'status-mark restricted'
              : 'status-mark'}
          >
            {data.organizationUsage.usage.organization.status}
          </span>
        </div>

        {#if data.organizationUsage.usage.organization.status === 'restricted'}
          <p class="restriction" role="status">
            Shared usage remains readable while membership growth is paused.
          </p>
        {/if}

        <nav class="organization-nav" aria-label="Organization workspace">
          <a href="/dashboard/organization/members/">People</a>
          <a href="/dashboard/organization/usage/" aria-current="page">Usage</a>
          <a href="/dashboard/organization/audit/">Audit</a>
        </nav>

        <dl class="metric-grid">
          <div>
            <dt>Seats in use</dt>
            <dd>
              {data.organizationUsage.usage.seats.limit === null
                ? `${formatCount(data.organizationUsage.usage.seats.used)} / unavailable`
                : `${formatCount(data.organizationUsage.usage.seats.used)} / ${formatCount(data.organizationUsage.usage.seats.limit)}`}
            </dd>
          </div>
          <div>
            <dt>Active machines</dt>
            <dd>{formatCount(data.organizationUsage.usage.fleet.activeMachines)}</dd>
          </div>
          <div>
            <dt>Seen within 7 days</dt>
            <dd>{formatCount(data.organizationUsage.usage.fleet.seenWithinSevenDays)}</dd>
          </div>
          <div>
            <dt>Not seen within 7 days</dt>
            <dd>{formatCount(data.organizationUsage.usage.fleet.notSeenWithinSevenDays)}</dd>
          </div>
        </dl>

        <section class="usage-section" aria-labelledby="member-usage-title">
          <div class="section-heading">
            <h3 id="member-usage-title">Member-attributed usage</h3>
            <span>Last {data.organizationUsage.usage.windowDays} days</span>
          </div>
          <p class="section-description">
            Usage is attributed only when machine telemetry reports an email belonging to a verified
            organization member.
          </p>
          {#if data.organizationUsage.usage.members.length === 0}
            <p class="empty-state">No accepted members were found.</p>
          {:else}
            <div
              class="table-scroll"
              role="region"
              aria-label="Member-attributed organization usage"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Role</th>
                    <th scope="col">Machines</th>
                    <th scope="col">Commands</th>
                    <th scope="col">Packages</th>
                    <th scope="col">Runtime switches</th>
                    <th scope="col">Time saved</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.organizationUsage.usage.members as member (member.email)}
                    <tr>
                      <th scope="row">
                        <strong>{member.name}</strong>
                        <span>{member.email}</span>
                      </th>
                      <td>{member.role}</td>
                      <td>{formatCount(member.attributedMachines)}</td>
                      <td>{formatCount(member.usage.commands)}</td>
                      <td>{formatCount(member.usage.packagesInstalled)}</td>
                      <td>{formatCount(member.usage.runtimeSwitches)}</td>
                      <td>{formatDuration(member.usage.timeSavedMs)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          {#if data.organizationUsage.usage.hasMoreMembers}
            <p class="bounded-note">Showing the first 100 members.</p>
          {/if}
        </section>

        <section class="usage-section" aria-labelledby="unattributed-title">
          <div class="section-heading">
            <h3 id="unattributed-title">Unattributed fleet usage</h3>
            <span>Kept separate from employees</span>
          </div>
          <p class="section-description">
            These reports do not match a verified member. OMG does not invent an employee assignment
            for them.
          </p>
          <dl class="metric-grid compact-grid">
            <div>
              <dt>Known active machines</dt>
              <dd>{formatCount(data.organizationUsage.usage.unattributed.machines)}</dd>
            </div>
            <div>
              <dt>Commands</dt>
              <dd>{formatCount(data.organizationUsage.usage.unattributed.usage.commands)}</dd>
            </div>
            <div>
              <dt>Packages installed</dt>
              <dd>
                {formatCount(data.organizationUsage.usage.unattributed.usage.packagesInstalled)}
              </dd>
            </div>
            <div>
              <dt>Runtime switches</dt>
              <dd>
                {formatCount(data.organizationUsage.usage.unattributed.usage.runtimeSwitches)}
              </dd>
            </div>
            <div>
              <dt>Time saved</dt>
              <dd>{formatDuration(data.organizationUsage.usage.unattributed.usage.timeSavedMs)}</dd>
            </div>
          </dl>
        </section>

        <section class="usage-section" aria-labelledby="versions-title">
          <div class="section-heading">
            <h3 id="versions-title">Reported versions</h3>
            <span>Active machines only</span>
          </div>
          {#if data.organizationUsage.usage.fleet.versions.length === 0}
            <p class="empty-state">No active machine version reports are available.</p>
          {:else}
            <ul class="version-list">
              {#each data.organizationUsage.usage.fleet.versions as version, index (`${version.version ?? 'unreported'}-${index}`)}
                <li>
                  <span>{version.version ?? 'Unreported'}</span>
                  <strong>{formatCount(version.machines)}</strong>
                </li>
              {/each}
            </ul>
          {/if}
          {#if data.organizationUsage.usage.fleet.hasMoreVersions}
            <p class="bounded-note">Showing the first 50 reported version groups.</p>
          {/if}
        </section>
      </section>
    {/if}
  </section>
</main>

<style>
  .usage-panel {
    max-width: 72rem;
  }

  .back-link,
  .text-link,
  .organization-nav a {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .back-link:hover,
  .text-link:hover,
  .organization-nav a:hover,
  .organization-nav a[aria-current='page'] {
    color: var(--signal);
  }

  .page-kicker {
    margin-top: 2.5rem;
  }

  .usage-state,
  .usage-state-panel {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .usage-state-panel h2 {
    margin: 0.55rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.75rem);
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .usage-state-panel > p:not(.state-label, .restriction) {
    max-width: 44rem;
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

  .status-mark,
  .section-heading span {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-mark {
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--rule-strong);
  }

  .status-mark.restricted {
    border-color: var(--signal);
    color: var(--signal);
  }

  .restriction {
    margin: 1.5rem 0 0;
    padding: 0.9rem 1rem;
    border-left: 2px solid var(--signal);
    background: color-mix(in srgb, var(--signal) 8%, transparent);
  }

  .organization-nav {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }

  .metric-grid {
    display: grid;
    gap: 1px;
    margin: 2rem 0 0;
    border: 1px solid var(--rule);
    background: var(--rule);
  }

  .metric-grid > div {
    min-width: 0;
    padding: 1.25rem;
    background: var(--paper);
  }

  .metric-grid dt {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .metric-grid dd {
    margin: 0.5rem 0 0;
    font-family: var(--font-mono);
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .usage-section {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--rule);
  }

  .usage-section h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: -0.04em;
  }

  .section-description,
  .empty-state,
  .bounded-note {
    margin: 1rem 0 0;
    color: var(--ink-muted);
    line-height: 1.6;
  }

  .table-scroll {
    margin-top: 1.5rem;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th,
  td {
    padding: 0.9rem;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: var(--ink-muted);
    font-weight: 500;
  }

  tbody th strong,
  tbody th span {
    display: block;
  }

  tbody th strong {
    color: var(--ink);
  }

  tbody th span {
    margin-top: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }

  td {
    font-family: var(--font-mono);
  }

  .version-list {
    display: grid;
    gap: 0;
    margin: 1.5rem 0 0;
    padding: 0;
    border-top: 1px solid var(--rule-strong);
    list-style: none;
  }

  .version-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--rule);
  }

  .version-list strong {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  @media (min-width: 40rem) {
    .metric-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .compact-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
