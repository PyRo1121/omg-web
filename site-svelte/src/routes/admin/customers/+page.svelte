<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import {
    formatCount,
    formatDuration,
    formatProductLabel,
    formatTimestamp,
  } from '../../dashboard/dashboard-view';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let selectedCustomer = $derived(form?.detail);
</script>

<svelte:head>
  <title>Customers - OMG Admin</title>
  <meta name="description" content="Private OMG customer support and license operations." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main id="main-content" class="customer-workspace">
  <header class="page-header">
    <div>
      <p class="page-kicker">Customers / support operations</p>
      <h1>Customer intelligence</h1>
      <p>Investigate account health and usage, then apply narrowly scoped license changes.</p>
    </div>
    <dl>
      <div>
        <dt>Customers</dt>
        <dd>{formatCount(data.directory.pagination.total)}</dd>
      </div>
      <div>
        <dt>Page</dt>
        <dd>{data.directory.pagination.page} / {data.directory.pagination.pages}</dd>
      </div>
    </dl>
  </header>

  <section class="directory-panel" aria-labelledby="directory-title">
    <header class="directory-tools">
      <div>
        <span>01 / Directory</span>
        <h2 id="directory-title">Customer roster</h2>
      </div>
      <form method="GET" action="/admin/customers/" role="search">
        <label for="customer-search">Search email or company</label>
        <div>
          <input
            id="customer-search"
            name="q"
            type="search"
            value={data.search}
            maxlength="100"
            autocomplete="off"
            placeholder="customer@example.com"
          />
          <button type="submit">Search</button>
          {#if data.search.length > 0}<a href="/admin/customers/">Clear</a>{/if}
        </div>
      </form>
    </header>

    {#if data.directory.customers.length === 0}
      <div class="empty-state">
        <strong>No matching customers.</strong>
        <p>Change the search term or clear the current filter.</p>
      </div>
    {:else}
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Lifecycle</th>
              <th scope="col">License</th>
              <th scope="col">Engagement</th>
              <th scope="col">30d activity</th>
              <th scope="col"><span class="visually-hidden">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {#each data.directory.customers as customer (customer.email)}
              <tr>
                <td>
                  <strong>{customer.email}</strong>
                  <small>{customer.company ?? 'No company recorded'}</small>
                </td>
                <td>
                  <span class="status-label" data-stage={customer.lifecycleStage}>
                    {formatProductLabel(customer.lifecycleStage)}
                  </span>
                  <small>
                    {customer.lastActiveDate === null
                      ? 'No activity recorded'
                      : `Last active ${formatTimestamp(customer.lastActiveDate)}`}
                  </small>
                </td>
                <td>
                  <strong>{formatProductLabel(customer.tier)}</strong>
                  <small>{formatProductLabel(customer.status)}</small>
                </td>
                <td>
                  <strong>{formatCount(customer.engagementScore)} / 100</strong>
                  <small>{formatCount(customer.activeMachines)} active machines</small>
                </td>
                <td>
                  <strong>{formatCount(customer.totalCommands)} commands</strong>
                  <small>{formatCount(customer.activeDays30d)} active days</small>
                </td>
                <td>
                  <form method="POST" action="?/inspect">
                    <input type="hidden" name="email" value={customer.email} />
                    <button class="inspect-button" type="submit">Inspect →</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if data.directory.pagination.pages > 1}
      <nav class="pagination" aria-label="Customer directory pages">
        {#if data.directory.pagination.page > 1}
          <a
            href={`?page=${data.directory.pagination.page - 1}${data.search ? `&q=${encodeURIComponent(data.search)}` : ''}`}
            >← Previous</a
          >
        {:else}<span></span>{/if}
        <span>Page {data.directory.pagination.page} of {data.directory.pagination.pages}</span>
        {#if data.directory.pagination.page < data.directory.pagination.pages}
          <a
            href={`?page=${data.directory.pagination.page + 1}${data.search ? `&q=${encodeURIComponent(data.search)}` : ''}`}
            >Next →</a
          >
        {:else}<span></span>{/if}
      </nav>
    {/if}
  </section>

  {#if form?.kind === 'error'}
    <p class="action-message error-message" role="alert">{form.message}</p>
  {:else if form?.kind === 'updated'}
    <p class="action-message success-message" role="status">{form.message}</p>
  {/if}

  {#if selectedCustomer}
    <section class="support-panel" aria-labelledby="support-title">
      <header class="support-header">
        <div>
          <span>02 / Customer support</span>
          <h2 id="support-title">{selectedCustomer.email}</h2>
          <p>{selectedCustomer.company ?? 'No company recorded'}</p>
        </div>
        <dl>
          <div>
            <dt>Created</dt>
            <dd>
              {selectedCustomer.createdAt === null
                ? 'Unavailable'
                : formatTimestamp(selectedCustomer.createdAt)}
            </dd>
          </div>
          <div>
            <dt>Telemetry</dt>
            <dd>{selectedCustomer.telemetryOptOut ? 'Opted out' : 'Enabled'}</dd>
          </div>
        </dl>
      </header>

      <div class="support-grid">
        <section aria-labelledby="license-controls-title">
          <header class="subpanel-header">
            <h3 id="license-controls-title">License controls</h3>
            <span>Audited mutation</span>
          </header>
          <dl class="license-facts">
            <div>
              <dt>Seats</dt>
              <dd>{selectedCustomer.maxSeats ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Machines</dt>
              <dd>{selectedCustomer.maxMachines ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {selectedCustomer.expiresAt === null
                  ? 'No expiry'
                  : formatTimestamp(selectedCustomer.expiresAt)}
              </dd>
            </div>
          </dl>
          <form class="license-form" method="POST" action="?/updateLicense">
            <input type="hidden" name="email" value={selectedCustomer.email} />
            <label>
              Tier
              <select name="tier" value={selectedCustomer.tier}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="team">Team</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" value={selectedCustomer.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label class="confirmation">
              <input type="checkbox" name="confirmation" value="confirmed" />
              I understand this changes customer access.
            </label>
            <button type="submit">Apply license change</button>
          </form>
        </section>

        <section aria-labelledby="machines-title">
          <header class="subpanel-header">
            <h3 id="machines-title">Machine fleet</h3>
            <span>{formatCount(selectedCustomer.machines.length)} recorded</span>
          </header>
          {#if selectedCustomer.machines.length === 0}
            <div class="empty-state"><strong>No machines recorded.</strong></div>
          {:else}
            <ul class="machine-list">
              {#each selectedCustomer.machines as machine, index (`${machine.hostname}:${machine.firstSeenAt}:${index}`)}
                <li>
                  <span class={`machine-state${machine.active ? ' active-machine' : ''}`}></span>
                  <div>
                    <strong>{machine.hostname ?? 'Unnamed machine'}</strong>
                    <small>
                      {machine.operatingSystem ?? 'Unknown OS'} / {machine.architecture ??
                        'Unknown architecture'} / OMG {machine.omgVersion ?? 'unknown'}
                    </small>
                  </div>
                  <time datetime={machine.lastSeenAt ?? undefined}>
                    {machine.lastSeenAt === null
                      ? 'Never seen'
                      : formatTimestamp(machine.lastSeenAt)}
                  </time>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>

      <section class="usage-panel" aria-labelledby="customer-usage-title">
        <header class="subpanel-header">
          <h3 id="customer-usage-title">Daily usage</h3>
          <span>Newest 30 recorded days</span>
        </header>
        {#if selectedCustomer.usage.length === 0}
          <div class="empty-state"><strong>No usage recorded.</strong></div>
        {:else}
          <div class="table-scroll">
            <table>
              <thead
                ><tr
                  ><th>Date</th><th>Commands</th><th>Installed</th><th>Searched</th><th>Runtimes</th
                  ><th>SBOMs</th><th>Vulnerabilities</th><th>Time saved</th></tr
                ></thead
              >
              <tbody>
                {#each selectedCustomer.usage as day (day.date)}
                  <tr>
                    <td><time datetime={day.date}>{day.date}</time></td>
                    <td>{formatCount(day.commands)}</td>
                    <td>{formatCount(day.packagesInstalled)}</td>
                    <td>{formatCount(day.packagesSearched)}</td>
                    <td>{formatCount(day.runtimesSwitched)}</td>
                    <td>{formatCount(day.sbomsGenerated)}</td>
                    <td>{formatCount(day.vulnerabilitiesFound)}</td>
                    <td>{formatDuration(day.timeSavedMs)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    </section>
  {/if}
</main>

<style>
  .customer-workspace {
    width: min(calc(100% - clamp(2rem, 4vw, 5rem)), 112rem);
    margin-inline: auto;
    padding-block: clamp(2rem, 4vw, 4rem) 6rem;
  }
  .page-header {
    display: grid;
    gap: 2rem;
    align-items: end;
  }
  .page-header h1 {
    margin: 0.6rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 5vw, 5rem);
    letter-spacing: -0.07em;
    line-height: 0.9;
  }
  .page-header p:not(.page-kicker) {
    max-width: 45rem;
    margin: 0.9rem 0 0;
    color: var(--ink-muted);
  }
  .page-header dl {
    display: flex;
    gap: 2.5rem;
    margin: 0;
    padding-top: 1rem;
    border-top: 1px solid var(--rule-strong);
  }
  .page-header dt,
  .page-header dd {
    margin: 0;
    font-family: var(--font-mono);
  }
  .page-header dt {
    color: var(--ink-muted);
    font-size: 0.68rem;
    text-transform: uppercase;
  }
  .page-header dd {
    margin-top: 0.25rem;
    font-size: 1rem;
  }
  .directory-panel,
  .support-panel {
    margin-top: 2rem;
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }
  .directory-tools,
  .support-header,
  .subpanel-header {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    align-items: end;
    justify-content: space-between;
    padding: 1.1rem 1.25rem;
    border-bottom: 1px solid var(--rule-strong);
  }
  .directory-tools span,
  .support-header span,
  .subpanel-header span {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
  }
  .directory-tools h2,
  .support-header h2,
  .subpanel-header h3 {
    margin: 0.25rem 0 0;
    font-family: var(--font-display);
    letter-spacing: -0.04em;
  }
  .directory-tools h2,
  .support-header h2 {
    font-size: 1.5rem;
  }
  .subpanel-header h3 {
    font-size: 1rem;
  }
  .directory-tools form label {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--ink-muted);
    font-size: 0.7rem;
  }
  .directory-tools form div {
    display: flex;
  }
  input,
  select,
  button {
    border-radius: 0;
    font: inherit;
  }
  .directory-tools input {
    width: min(20rem, 48vw);
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--rule-strong);
    background: var(--paper);
    color: var(--ink);
  }
  .directory-tools button,
  .directory-tools a,
  .inspect-button,
  .license-form button {
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--rule-strong);
    background: var(--signal);
    color: var(--signal-ink);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-decoration: none;
    cursor: pointer;
  }
  .directory-tools a {
    background: transparent;
    color: var(--ink-muted);
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--rule-strong);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 500;
    text-transform: uppercase;
    white-space: nowrap;
  }
  td {
    padding: 0.95rem 1rem;
    border-bottom: 1px solid var(--rule);
    font-size: 0.78rem;
    vertical-align: middle;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: rgb(255 255 255 / 0.025);
  }
  td strong,
  td small {
    display: block;
  }
  td small {
    margin-top: 0.25rem;
    color: var(--ink-muted);
    font-size: 0.68rem;
    white-space: nowrap;
  }
  .status-label {
    display: inline-block;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--rule-strong);
    font-family: var(--font-mono);
    font-size: 0.66rem;
  }
  .status-label[data-stage='at_risk'],
  .status-label[data-stage='churned'] {
    border-color: var(--signal);
    color: var(--signal);
  }
  .inspect-button {
    white-space: nowrap;
  }
  .pagination {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--rule-strong);
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .pagination a {
    color: var(--ink);
  }
  .action-message {
    margin: 1rem 0 0;
    padding: 1rem;
    border: 1px solid var(--rule-strong);
    font-size: 0.8rem;
  }
  .error-message {
    border-color: var(--danger);
  }
  .success-message {
    border-color: var(--ink);
  }
  .support-header p {
    margin: 0.25rem 0 0;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  .support-header dl {
    display: flex;
    gap: 2rem;
    margin: 0;
  }
  .support-header dt,
  .support-header dd {
    margin: 0;
    font-size: 0.7rem;
  }
  .support-header dt {
    color: var(--ink-muted);
  }
  .support-grid {
    display: grid;
  }
  .support-grid > section {
    min-width: 0;
    border-bottom: 1px solid var(--rule-strong);
  }
  .license-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
    border-bottom: 1px solid var(--rule);
  }
  .license-facts div {
    padding: 1rem;
    border-right: 1px solid var(--rule);
  }
  .license-facts div:last-child {
    border-right: 0;
  }
  .license-facts dt,
  .license-facts dd {
    margin: 0;
    font-size: 0.72rem;
  }
  .license-facts dt {
    color: var(--ink-muted);
  }
  .license-facts dd {
    margin-top: 0.25rem;
    font-family: var(--font-mono);
  }
  .license-form {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
  }
  .license-form label {
    display: grid;
    gap: 0.4rem;
    color: var(--ink-muted);
    font-size: 0.72rem;
  }
  .license-form select {
    padding: 0.7rem;
    border: 1px solid var(--rule-strong);
    background: var(--paper);
    color: var(--ink);
  }
  .license-form .confirmation {
    display: flex;
    align-items: center;
    color: var(--ink);
  }
  .license-form .confirmation input {
    accent-color: var(--signal);
  }
  .license-form button {
    width: fit-content;
  }
  .machine-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .machine-list li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--rule);
  }
  .machine-list li:last-child {
    border-bottom: 0;
  }
  .machine-state {
    width: 0.55rem;
    height: 0.55rem;
    margin-top: 0.25rem;
    background: var(--ink-faint);
  }
  .machine-state.active-machine {
    background: var(--signal);
  }
  .machine-list strong,
  .machine-list small {
    display: block;
  }
  .machine-list small,
  .machine-list time {
    margin-top: 0.2rem;
    color: var(--ink-muted);
    font-size: 0.68rem;
  }
  .machine-list time {
    grid-column: 2;
    font-family: var(--font-mono);
  }
  .usage-panel {
    border-top: 0;
  }
  .empty-state {
    padding: 1.5rem 1.25rem;
  }
  .empty-state p {
    margin: 0.35rem 0 0;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
  @media (min-width: 48rem) {
    .page-header {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .machine-list li {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: baseline;
    }
    .machine-list time {
      grid-column: auto;
    }
  }
  @media (min-width: 78rem) {
    .support-grid {
      grid-template-columns: minmax(24rem, 0.7fr) minmax(0, 1.3fr);
    }
    .support-grid > section:first-child {
      border-right: 1px solid var(--rule-strong);
    }
  }
</style>
