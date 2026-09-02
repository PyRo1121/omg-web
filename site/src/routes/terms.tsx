import { Title, Meta, Link } from '@solidjs/meta';
import { A } from '@solidjs/router';
import Footer from '~/components/Footer';
import Header from '~/components/Header';

/** Terms of service for the OMG Package Manager site, CLI, and hosted services. */
export default function TermsPage() {
  return (
    <>
      <Title>Terms of Service - OMG Package Manager</Title>
      <Meta
        name="description"
        content="Terms of Service for the OMG Package Manager website, CLI, and hosted services."
      />
      <Link rel="canonical" href="https://omg.latham.cloud/terms/" />

      <div class="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <Header />
        <main class="manifest-shell px-2 pt-32 pb-24 sm:px-0 sm:pt-40">
          <p class="font-mono text-xs text-[var(--signal)]">Service agreement</p>
          <h1 class="mt-6 text-6xl font-medium tracking-[-0.06em] sm:text-8xl">Terms of service</h1>
          <p class="mt-6 border-b border-[var(--rule)] pb-8 font-mono text-xs text-[var(--ink-muted)]">
            Last updated September 2, 2026
          </p>

          <div class="max-w-3xl space-y-10 pt-10 text-sm leading-relaxed text-[var(--ink-muted)]">
            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                1. The service
              </h2>
              <p>
                OMG Package Manager ("OMG") is a free and open-source unified package manager CLI
                for Linux and macOS under the MIT License, with optional hosted account services
                providing telemetry and dashboards. Hosted services are provided under these terms.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                2. Accounts and dashboard access
              </h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>
                  You are responsible for activity performed through your account and linked machine
                  tokens.
                </li>
                <li>
                  Account linking is optional. All CLI package and runtime features are free and
                  fully functional locally without an account.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                3. Acceptable use
              </h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>No attempts to breach, overload, or abuse the service or its APIs.</li>
                <li>
                  No submission of malicious content, including formula-injection payloads into
                  profile fields that other users may export.
                </li>
                <li>No resale of hosted services without written agreement.</li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                4. Disclaimer and liability
              </h2>
              <p>
                The service is provided "as is" without warranties of any kind. To the maximum
                extent permitted by law, OMG's operators are not liable for indirect, incidental, or
                consequential damages arising from use of the service.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                5. Changes and contact
              </h2>
              <p>
                These terms may be updated; material changes will be announced on the site.
                Continued use after changes constitutes acceptance. Questions:{' '}
                <a class="font-semibold text-[var(--signal)]" href="mailto:support@latham.cloud">
                  support@latham.cloud
                </a>
                .
              </p>
            </section>
          </div>

          <A href="/" class="manifest-button mt-12">
            ← Back to home
          </A>
        </main>
        <Footer />
      </div>
    </>
  );
}
