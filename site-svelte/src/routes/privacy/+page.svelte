<!--
  Privacy policy. The canonical machine-readable summary is served by
  GET /api/privacy/status (`privacy_policy_version` 2.0); keep this page in
  step with that contract when retention periods or rights change.
-->
<svelte:head>
  <title>Privacy Policy - OMG Package Manager</title>
  <meta
    name="description"
    content="How OMG Package Manager collects, uses, and protects your data: telemetry opt-out, data export, deletion, and retention periods."
  />
  <link rel="canonical" href="https://omg.latham.cloud/privacy/" />
</svelte:head>

<main id="main-content" class="policy-shell">
  <p class="policy-kicker">Privacy and data rights</p>
  <h1 class="policy-title">Privacy policy</h1>
  <p class="policy-meta">Version 2.0 / Last updated February 7, 2026</p>

  <div class="policy-body">
    <section>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account data:</strong> your email address, display name, and OAuth provider identifiers
          when you sign in.
        </li>
        <li>
          <strong>License and billing data:</strong> license keys, tier, seat assignments, machine registrations,
          and Stripe payment records.
        </li>
        <li>
          <strong>Introductory offers:</strong> the email address submitted to request a promotion, the
          issued code, and its expiration. Requesting a code does not subscribe the address to marketing
          email.
        </li>
        <li>
          <strong>Telemetry (opt-out):</strong> anonymized CLI usage such as command counts, package names,
          durations, and platform info, tied to your license. Customers can disable telemetry at any time
          from the dashboard or via the API.
        </li>
      </ul>
    </section>

    <section>
      <h2>Data retention</h2>
      <ul>
        <li>Telemetry events: 90 days</li>
        <li>Audit logs: 30 days</li>
        <li>Usage statistics: 12 months</li>
        <li>Introductory offer requests: 12 months</li>
        <li>Payment records: retained per Stripe requirements</li>
      </ul>
    </section>

    <section>
      <h2>Your rights</h2>
      <p class="policy-lead">These rights are available to all users regardless of location:</p>
      <ul>
        <li>
          <strong>Access and portability:</strong> export your data as JSON from the dashboard settings
          or via POST /api/privacy/export.
        </li>
        <li>
          <strong>Deletion:</strong> delete your telemetry and account data via POST /api/privacy/delete.
          Deletion is irreversible; audit logs are retained for 30 days for security purposes and payment
          records per Stripe requirements.
        </li>
        <li>
          <strong>Opt-out:</strong> stop telemetry collection at any time via POST /api/privacy/opt-out
          or the dashboard.
        </li>
      </ul>
    </section>

    <section>
      <h2>Contact</h2>
      <p>
        Questions or requests regarding this policy can be sent to
        <a href="mailto:support@latham.cloud">support@latham.cloud</a>.
      </p>
    </section>
  </div>

  <a href="/" class="policy-home">← Back to home</a>
</main>

<style>
  .policy-shell {
    max-width: calc(42rem + clamp(2rem, 8vw, 6rem));
    min-height: 100vh;
    margin: 0 auto;
    padding: clamp(4rem, 12vw, 10rem) clamp(1rem, 4vw, 3rem) clamp(5rem, 14vw, 9rem);
  }

  .policy-kicker {
    margin: 0;
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .policy-title {
    margin: 1.25rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(3rem, 9vw, 5.75rem);
    font-weight: 650;
    letter-spacing: -0.06em;
    line-height: 0.92;
  }

  .policy-meta {
    margin: 1.5rem 0 0;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--rule);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .policy-body {
    max-width: 42rem;
    display: grid;
    gap: 2.5rem;
    padding-top: 2.5rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
    line-height: 1.85;
  }

  .policy-body h2 {
    margin: 0 0 0.75rem;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .policy-body p {
    margin: 0;
  }

  .policy-lead {
    margin-bottom: 0.75rem !important;
  }

  .policy-body ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding-left: 1.25rem;
    list-style: disc;
  }

  .policy-body strong {
    color: var(--ink);
    font-weight: 600;
  }

  .policy-body a {
    color: var(--signal);
    font-weight: 600;
    text-decoration-color: var(--signal);
    text-underline-offset: 0.2rem;
  }

  .policy-home {
    display: inline-block;
    margin-top: 3rem;
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--rule-strong);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .policy-home:hover {
    border-color: var(--signal);
    color: var(--signal);
  }
</style>
