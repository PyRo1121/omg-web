<!-- Terms of service for the OMG Package Manager site, CLI, and licensing API. -->
<script lang="ts">
  import { SITE_ORIGIN } from '../../../../shared/public-site';

  const canonicalUrl = `${SITE_ORIGIN}/terms/`;
  const socialImage = `${SITE_ORIGIN}/og/omg-og.png`;
</script>

<svelte:head>
  <title>Terms of Service - OMG Package Manager</title>
  <meta
    name="description"
    content="Terms of Service for the OMG Package Manager website, CLI, and hosted services."
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={canonicalUrl} />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="Terms of Service - OMG Package Manager" />
  <meta
    property="og:description"
    content="Terms for the OMG Package Manager website, CLI, accounts, and hosted services."
  />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={socialImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="OMG Package Manager product overview." />
  <meta property="og:site_name" content="OMG Package Manager" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Terms of Service - OMG Package Manager" />
  <meta
    name="twitter:description"
    content="Terms for the OMG Package Manager website, CLI, accounts, and hosted services."
  />
  <meta name="twitter:image" content={socialImage} />
  <meta name="twitter:image:alt" content="OMG Package Manager product overview." />
</svelte:head>

<main id="main-content" class="legal-shell">
  <p class="page-kicker">Service agreement</p>
  <h1 class="legal-title">Terms of service</h1>
  <p class="legal-meta">Last updated September 2, 2026</p>

  <div class="legal-body">
    <section>
      <h2>1. The service</h2>
      <p>
        OMG Package Manager ("OMG") is a free and open-source unified package manager CLI for Linux
        and macOS under the MIT License, with optional hosted account services providing telemetry
        and dashboards. Hosted services are provided under these terms.
      </p>
    </section>

    <section>
      <h2>2. Accounts and dashboard access</h2>
      <ul>
        <li>
          You are responsible for activity performed through your account and linked machine tokens.
        </li>
        <li>
          Account linking is optional. All CLI package and runtime features are free and fully
          functional locally without an account.
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
      <h2>4. Disclaimer and liability</h2>
      <p>
        The service is provided "as is" without warranties of any kind. To the maximum extent
        permitted by law, OMG's operators are not liable for indirect, incidental, or consequential
        damages arising from use of the service.
      </p>
    </section>

    <section>
      <h2>5. Changes and contact</h2>
      <p>
        These terms may be updated; material changes will be announced on the site. Continued use
        after changes constitutes acceptance. Questions:
        <a href="mailto:support@latham.cloud">support@latham.cloud</a>.
      </p>
    </section>
  </div>

  <a href="/" class="legal-home">← Back to home</a>
</main>
