<script lang="ts">
  import {
    formatCount,
    formatDuration,
    formatProductLabel,
    formatTimestamp,
    organizationAuditActionLabel,
  } from '../../../dashboard/dashboard-view';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.support.organization.name} support - OMG Control Center</title>
  <meta name="description" content="Private organization support workspace." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="support-shell">
  <a class="back-link" href="/admin/organizations/">← Organization directory</a>

  <header class="page-header">
    <div>
      <p>Operator / Organization support</p>
      <h1>{data.support.organization.name}</h1>
      <span>{data.support.organization.slug}</span>
    </div>
    <div class="operator">
      <span>Operator</span>
      <strong>{data.operatorName}</strong>
    </div>
  </header>

  <dl class="summary-grid">
    <div>
      <dt>Entitlement</dt>
      <dd>{formatProductLabel(data.support.entitlement.tier ?? 'unavailable')}</dd>
      <span>{formatProductLabel(data.support.entitlement.licenseStatus ?? 'unavailable')}</span>
    </div>
    <div>
      <dt>Workspace access</dt>
      <dd>{formatProductLabel(data.support.entitlement.access)}</dd>
      <span>Server-derived state</span>
    </div>
    <div>
      <dt>Seats</dt>
      <dd>
        {formatCount(data.support.seats.used)} / {data.support.seats.limit === null
          ? 'unavailable'
          : formatCount(data.support.seats.limit)}
      </dd>
      <span>Accepted members</span>
    </div>
    <div>
      <dt>Active fleet</dt>
      <dd>{formatCount(data.support.fleet.activeMachines)}</dd>
      <span>{formatCount(data.support.fleet.seenWithinSevenDays)} seen within 7 days</span>
    </div>
  </dl>

  <div class="workspace-grid">
    <section class="panel members-panel" aria-labelledby="members-title">
      <header>
        <div>
          <span>01 / Membership</span>
          <h2 id="members-title">Accepted members</h2>
        </div>
        <strong>{formatCount(data.support.members.length)} shown</strong>
      </header>
      {#if data.support.members.length === 0}
        <p class="empty-state">No accepted members were found.</p>
      {:else}
        <div class="table-scroll" role="region" aria-label="Organization members">
          <table>
            <thead>
              <tr><th>Member</th><th>Role</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {#each data.support.members as member (member.email)}
                <tr>
                  <th scope="row"><strong>{member.name}</strong><span>{member.email}</span></th>
                  <td>{formatProductLabel(member.role)}</td>
                  <td>{formatTimestamp(member.joinedAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if data.support.hasMoreMembers}
        <p class="bounded-note">Showing the first 100 accepted members.</p>
      {/if}
    </section>

    <section class="panel invitations-panel" aria-labelledby="invitations-title">
      <header>
        <div>
          <span>02 / Invitations</span>
          <h2 id="invitations-title">Pending invitations</h2>
        </div>
        <strong>{formatCount(data.support.invitations.length)} shown</strong>
      </header>
      {#if data.support.invitations.length === 0}
        <p class="empty-state">No pending invitations were found.</p>
      {:else}
        <ul class="record-list">
          {#each data.support.invitations as invitation (invitation.email)}
            <li>
              <div>
                <strong>{invitation.email}</strong>
                <span>{formatProductLabel(invitation.role)} · {invitation.status}</span>
              </div>
              <time datetime={invitation.expiresAt}>{formatTimestamp(invitation.expiresAt)}</time>
            </li>
          {/each}
        </ul>
      {/if}
      {#if data.support.hasMoreInvitations}
        <p class="bounded-note">Showing the first 100 pending invitations.</p>
      {/if}
    </section>

    <section class="panel usage-panel" aria-labelledby="usage-title">
      <header>
        <div>
          <span>03 / Usage</span>
          <h2 id="usage-title">30-day activity</h2>
        </div>
        <strong>{formatCount(data.support.usage.activeDays)} active days</strong>
      </header>
      <dl class="metric-grid">
        <div>
          <dt>Commands</dt>
          <dd>{formatCount(data.support.usage.totals.commands)}</dd>
        </div>
        <div>
          <dt>Packages installed</dt>
          <dd>{formatCount(data.support.usage.totals.packagesInstalled)}</dd>
        </div>
        <div>
          <dt>Packages searched</dt>
          <dd>{formatCount(data.support.usage.totals.packagesSearched)}</dd>
        </div>
        <div>
          <dt>Runtime switches</dt>
          <dd>{formatCount(data.support.usage.totals.runtimeSwitches)}</dd>
        </div>
        <div>
          <dt>SBOMs</dt>
          <dd>{formatCount(data.support.usage.totals.sbomsGenerated)}</dd>
        </div>
        <div>
          <dt>Vulnerabilities</dt>
          <dd>{formatCount(data.support.usage.totals.vulnerabilitiesFound)}</dd>
        </div>
        <div>
          <dt>Time saved</dt>
          <dd>{formatDuration(data.support.usage.totals.timeSavedMs)}</dd>
        </div>
      </dl>
    </section>

    <section class="panel fleet-panel" aria-labelledby="fleet-title">
      <header>
        <div>
          <span>04 / Fleet</span>
          <h2 id="fleet-title">Machine recency</h2>
        </div>
        <strong>{formatCount(data.support.fleet.activeMachines)} active</strong>
      </header>
      <dl class="fleet-reach">
        <div>
          <dt>Seen within 7 days</dt>
          <dd>{formatCount(data.support.fleet.seenWithinSevenDays)}</dd>
        </div>
        <div>
          <dt>Not seen within 7 days</dt>
          <dd>{formatCount(data.support.fleet.notSeenWithinSevenDays)}</dd>
        </div>
      </dl>
      {#if data.support.fleet.versions.length === 0}
        <p class="empty-state">No active machine versions were reported.</p>
      {:else}
        <ul class="version-list">
          {#each data.support.fleet.versions as version, index (`${version.version ?? 'unreported'}:${index}`)}
            <li>
              <span>{version.version ?? 'Unreported'}</span><strong>{version.machines}</strong>
            </li>
          {/each}
        </ul>
      {/if}
      {#if data.support.fleet.hasMoreVersions}
        <p class="bounded-note">Showing the first 50 version groups.</p>
      {/if}
    </section>

    <section class="panel audit-panel" aria-labelledby="audit-title">
      <header>
        <div>
          <span>05 / Audit</span>
          <h2 id="audit-title">Recent organization events</h2>
        </div>
        <strong>{formatCount(data.support.audit.events.length)} shown</strong>
      </header>
      {#if data.support.audit.events.length === 0}
        <p class="empty-state">No organization audit events were found.</p>
      {:else}
        <ol class="record-list">
          {#each data.support.audit.events as event, index (`${event.occurredAt}:${index}`)}
            <li>
              <div>
                <strong>{organizationAuditActionLabel(event.action)}</strong>
                <span
                  >{event.role === null ? 'Role unavailable' : formatProductLabel(event.role)}</span
                >
              </div>
              <time datetime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
            </li>
          {/each}
        </ol>
      {/if}
      {#if data.support.audit.hasMoreEvents}
        <p class="bounded-note">Showing the 25 most recent organization events.</p>
      {/if}
    </section>
  </div>
</main>

<style>
  .support-shell {
    width: min(calc(100% - clamp(2rem, 5vw, 6rem)), 96rem);
    margin-inline: auto;
    padding-block: clamp(1.5rem, 4vw, 4rem) 6rem;
  }
  .back-link {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-decoration: none;
  }
  .back-link:hover {
    color: var(--signal);
  }
  .page-header {
    display: grid;
    gap: 2rem;
    margin-top: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--rule-strong);
  }
  .page-header p,
  .page-header span,
  .operator span,
  .summary-grid dt,
  .summary-grid span,
  .panel header span,
  .panel header > strong,
  .record-list span,
  .record-list time,
  .bounded-note {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }
  .page-header p {
    margin: 0;
    text-transform: uppercase;
  }
  .page-header h1 {
    margin: 0.45rem 0 0.25rem;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 7vw, 5.5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
  }
  .operator {
    display: grid;
    align-content: end;
    gap: 0.25rem;
  }
  .summary-grid,
  .metric-grid,
  .fleet-reach {
    display: grid;
    gap: 1px;
    margin: 0;
    border: 1px solid var(--rule-strong);
    background: var(--rule-strong);
  }
  .summary-grid {
    margin-top: 2rem;
  }
  .summary-grid > div,
  .metric-grid > div,
  .fleet-reach > div {
    min-width: 0;
    padding: 1rem;
    background: var(--paper-raised);
  }
  .summary-grid dd,
  .metric-grid dd,
  .fleet-reach dd {
    margin: 0.45rem 0 0.25rem;
    font-family: var(--font-mono);
  }
  .summary-grid span {
    overflow-wrap: anywhere;
  }
  .workspace-grid {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }
  .panel {
    min-width: 0;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }
  .panel > header {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: end;
    justify-content: space-between;
    padding: 1rem 1.15rem;
    border-bottom: 1px solid var(--rule-strong);
  }
  .panel h2 {
    margin: 0.25rem 0 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    letter-spacing: -0.04em;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 38rem;
    border-collapse: collapse;
    text-align: left;
  }
  th,
  td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--rule);
    font-size: 0.75rem;
  }
  thead th {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 500;
    text-transform: uppercase;
  }
  tbody th strong,
  tbody th span {
    display: block;
  }
  tbody th span {
    margin-top: 0.2rem;
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.66rem;
  }
  .record-list,
  .version-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .record-list li,
  .version-list li {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.85rem 1.1rem;
    border-bottom: 1px solid var(--rule);
  }
  .record-list div,
  .record-list strong,
  .record-list span {
    display: block;
  }
  .record-list span {
    margin-top: 0.2rem;
  }
  .record-list time {
    text-align: right;
  }
  .metric-grid {
    border: 0;
  }
  .fleet-reach {
    border: 0;
    border-bottom: 1px solid var(--rule-strong);
  }
  .version-list li strong {
    font-family: var(--font-mono);
  }
  .empty-state,
  .bounded-note {
    margin: 0;
    padding: 1.25rem 1.1rem;
    color: var(--ink-muted);
  }
  @media (min-width: 38rem) {
    .page-header {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .summary-grid,
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .fleet-reach {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 68rem) {
    .summary-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .workspace-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .members-panel,
    .usage-panel,
    .audit-panel {
      grid-column: 1 / -1;
    }
    .metric-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (max-width: 30rem) {
    .support-shell {
      width: min(calc(100% - 2rem), 96rem);
    }
    .record-list li {
      display: grid;
    }
    .record-list time {
      text-align: left;
    }
  }
</style>
