<!-- Terms of service for the OMG Package Manager site, CLI, and licensing API. -->
<svelte:head>
  <title>Terms of Service - OMG Package Manager</title>
  <meta
    name="description"
    content="Terms of Service for the OMG Package Manager website, CLI, licenses, and subscriptions."
  />
  <link rel="canonical" href="https://omg.latham.cloud/terms/" />
</svelte:head>

<main id="main-content" class="terms-shell">
  <p class="terms-kicker">Service agreement</p>
  <h1 class="terms-title">Terms of service</h1>
  <p class="terms-meta">Last updated February 7, 2026</p>

  <div class="terms-body">
    <section>
      <h2>1. The service</h2>
      <p>
        OMG Package Manager ("OMG") is a unified package manager CLI for Linux with an optional
        licensing platform providing telemetry, dashboards, and team features. The CLI is open
        source under its repository license; hosted services (accounts, licensing, dashboards) are
        provided under these terms.
      </p>
    </section>

    <section>
      <h2>2. Accounts and licenses</h2>
      <ul>
        <li>You are responsible for activity performed through your account and keys.</li>
        <li>
          License keys are scoped to your tier's machine limits. Do not share keys beyond your
          license's seat count or attempt to circumvent machine limits.
        </li>
        <li>
          Free-tier features may change; paid tiers keep their advertised feature set for the
          duration of a paid period.
        </li>
      </ul>
    </section>

    <section>
      <h2>3. Acceptable use</h2>
      <ul>
        <li>No attempts to breach, overload, or abuse the service or its APIs.</li>
        <li>
          No submission of malicious content, including formula-injection payloads into profile
          fields that other users may export.
        </li>
        <li>No resale of hosted services without written agreement.</li>
      </ul>
    </section>

    <section>
      <h2>4. Billing</h2>
      <p>
        Paid tiers are billed through Stripe. Subscriptions renew until canceled and can be managed
        via the billing portal in your dashboard. Refunds and chargebacks may result in immediate
        downgrade or suspension of the associated license.
      </p>
    </section>

    <section>
      <h2>5. Disclaimer and liability</h2>
      <p>
        The service is provided "as is" without warranties of any kind. To the maximum extent
        permitted by law, OMG's operators are not liable for indirect, incidental, or consequential
        damages arising from use of the service.
      </p>
    </section>

    <section>
      <h2>6. Changes and contact</h2>
      <p>
        These terms may be updated; material changes will be announced on the site. Continued use
        after changes constitutes acceptance. Questions:
        <a href="mailto:support@latham.cloud">support@latham.cloud</a>.
      </p>
    </section>
  </div>

  <a href="/" class="terms-home">← Back to home</a>
</main>

<style>
  .terms-shell {
    max-width: calc(42rem + clamp(2rem, 8vw, 6rem));
    min-height: 100vh;
    margin: 0 auto;
    padding: clamp(4rem, 12vw, 10rem) clamp(1rem, 4vw, 3rem) clamp(5rem, 14vw, 9rem);
  }

  .terms-kicker {
    margin: 0;
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .terms-title {
    margin: 1.25rem 0 0;
    font-family: var(--font-display);
    font-size: clamp(3rem, 9vw, 5.75rem);
    font-weight: 650;
    letter-spacing: -0.06em;
    line-height: 0.92;
  }

  .terms-meta {
    margin: 1.5rem 0 0;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--rule);
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .terms-body {
    max-width: 42rem;
    display: grid;
    gap: 2.5rem;
    padding-top: 2.5rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
    line-height: 1.85;
  }

  .terms-body h2 {
    margin: 0 0 0.75rem;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .terms-body p,
  .terms-body ul {
    margin: 0;
  }

  .terms-body ul {
    display: grid;
    gap: 0.5rem;
    padding-left: 1.25rem;
    list-style: disc;
  }

  .terms-body a {
    color: var(--signal);
    font-weight: 600;
    text-decoration-color: var(--signal);
    text-underline-offset: 0.2rem;
  }

  .terms-home {
    display: inline-block;
    margin-top: 3rem;
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--rule-strong);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .terms-home:hover {
    border-color: var(--signal);
    color: var(--signal);
  }
</style>
