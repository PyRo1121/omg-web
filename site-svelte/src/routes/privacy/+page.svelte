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

<main id="main-content" class="legal-shell">
  <p class="page-kicker">Privacy and data rights</p>
  <h1 class="legal-title">Privacy policy</h1>
  <p class="legal-meta">Version 2.0 / Last updated February 7, 2026</p>

  <div class="legal-body">
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

  <a href="/" class="legal-home">← Back to home</a>
</main>

<style>
  .policy-lead {
    margin-bottom: 0.75rem !important;
  }

  .legal-body strong {
    color: var(--ink);
    font-weight: 600;
  }
</style>
