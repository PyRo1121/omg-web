<!--
  Privacy policy. The canonical machine-readable summary is served by
  GET /api/privacy/status (`privacy_policy_version` 2.1); keep this page in
  step with that contract when retention periods or rights change.
-->
<svelte:head>
  <title>Privacy Policy - OMG Package Manager</title>
  <meta
    name="description"
    content="How OMG Package Manager collects, uses, and protects your data: telemetry opt-out, data export, deletion, and retention periods."
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://omg.latham.cloud/privacy/" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="Privacy Policy - OMG Package Manager" />
  <meta
    property="og:description"
    content="How OMG Package Manager collects, uses, and protects account, license, billing, and telemetry data."
  />
  <meta property="og:url" content="https://omg.latham.cloud/privacy/" />
  <meta property="og:image" content="https://omg.latham.cloud/og/omg-og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="OMG Package Manager product overview." />
  <meta property="og:site_name" content="OMG Package Manager" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Privacy Policy - OMG Package Manager" />
  <meta
    name="twitter:description"
    content="How OMG Package Manager collects, uses, and protects account, license, billing, and telemetry data."
  />
  <meta name="twitter:image" content="https://omg.latham.cloud/og/omg-og.png" />
  <meta name="twitter:image:alt" content="OMG Package Manager product overview." />
</svelte:head>

<main id="main-content" class="legal-shell">
  <p class="page-kicker">Privacy and data rights</p>
  <h1 class="legal-title">Privacy policy</h1>
  <p class="legal-meta">Version 2.1 / Last updated September 1, 2026</p>

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
          <strong>CLI telemetry (opt-out):</strong> pseudonymous command usage, package and runtime names,
          durations, errors, platform information, and performance measurements associated with your license.
        </li>
        <li>
          <strong>Website analytics:</strong> page paths or documentation URLs, interactions, performance
          measurements, referrer domains, campaign parameters, browser and device categories, and Cloudflare-provided
          country and city. Documentation analytics may retain a truncated user-agent string. Application
          analytics does not store your raw IP address.
        </li>
        <li>
          <strong>Security records:</strong> session times, IP addresses, user agents, and authentication
          or account-change audit events used to protect accounts and investigate abuse.
        </li>
      </ul>
    </section>

    <section>
      <h2>How we use data</h2>
      <p>
        We use data to provide and secure accounts, licenses, organizations, billing, support, and
        email; operate and improve OMG; measure reliability and feature adoption; prevent abuse; and
        satisfy legal or payment-record obligations. We do not sell personal information or use it
        for targeted advertising.
      </p>
    </section>

    <section>
      <h2>Cookies and identifiers</h2>
      <p>
        Sign-in uses an essential secure session cookie. Public website analytics uses no cookies,
        local storage, or session storage. The analytics service derives a daily rotating
        pseudonymous visitor identifier from the request IP address and user agent; raw IP addresses
        may still appear in bounded security and authenticated-session records.
      </p>
    </section>

    <section>
      <h2>Service providers</h2>
      <p>
        Cloudflare provides hosting, database, network, security, and email infrastructure. GitHub
        provides OAuth sign-in. Stripe processes billing and payment records. These providers
        process data needed to deliver their services under their own terms and privacy commitments.
      </p>
    </section>

    <section>
      <h2>Data retention</h2>
      <ul>
        <li>Raw CLI and website analytics events: 90 days</li>
        <li>Raw documentation analytics events: 7 days; documentation sessions: 30 days</li>
        <li>Audit logs: 30 days</li>
        <li>Aggregate and per-license usage statistics: 12 months</li>
        <li>Introductory offer requests: 12 months</li>
        <li>
          Account, license, organization, and billing records: while needed to provide the service
        </li>
        <li>Payment records: as required by Stripe and applicable law</li>
      </ul>
    </section>

    <section>
      <h2>Your rights</h2>
      <p class="policy-lead">These rights are available to all users regardless of location:</p>
      <ul>
        <li>
          <strong>Access and portability:</strong> request a portable copy from support. API-authenticated
          customers can also use POST /api/privacy/export.
        </li>
        <li>
          <strong>Deletion:</strong> request deletion from support. API-authenticated customers can also
          use POST /api/privacy/delete. Deletion is irreversible; audit logs are retained for 30 days
          for security purposes and payment records per Stripe requirements.
        </li>
        <li>
          <strong>Opt-out:</strong> request a telemetry opt-out from support. API-authenticated customers
          can also use POST /api/privacy/opt-out.
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
