import { Title, Meta, Link } from '@solidjs/meta';
import { A } from '@solidjs/router';
import Footer from '~/components/Footer';

/** Terms of service for the OMG Package Manager site, CLI, and licensing API. */
export default function TermsPage() {
  return (
    <>
      <Title>Terms of Service - OMG Package Manager</Title>
      <Meta
        name="description"
        content="Terms of Service for the OMG Package Manager website, CLI, licenses, and subscriptions."
      />
      <Link rel="canonical" href="https://omg.latham.cloud/terms" />

      <div class="min-h-screen bg-[#0a0a0a] text-slate-200">
        <main class="mx-auto max-w-3xl px-6 py-16">
          <h1 class="mb-2 text-3xl font-bold text-white">Terms of Service</h1>
          <p class="mb-10 text-sm text-slate-500">Last updated February 7, 2026</p>

          <div class="space-y-8 text-sm leading-relaxed text-slate-300">
            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">1. The service</h2>
              <p>
                OMG Package Manager ("OMG") is a unified package manager CLI for Linux with an
                optional licensing platform providing telemetry, dashboards, and team features. The
                CLI is open source under its repository license; hosted services (accounts,
                licensing, dashboards) are provided under these terms.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">2. Accounts and licenses</h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>You are responsible for activity performed through your account and keys.</li>
                <li>
                  License keys are scoped to your tier's machine limits. Do not share keys beyond
                  your license's seat count or attempt to circumvent machine limits.
                </li>
                <li>
                  Free-tier features may change; paid tiers keep their advertised feature set for
                  the duration of a paid period.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">3. Acceptable use</h2>
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
              <h2 class="mb-3 text-lg font-semibold text-white">4. Billing</h2>
              <p>
                Paid tiers are billed through Stripe. Subscriptions renew until canceled and can be
                managed via the billing portal in your dashboard. Refunds and chargebacks may result
                in immediate downgrade or suspension of the associated license.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">5. Disclaimer and liability</h2>
              <p>
                The service is provided "as is" without warranties of any kind. To the maximum
                extent permitted by law, OMG's operators are not liable for indirect, incidental, or
                consequential damages arising from use of the service.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">6. Changes and contact</h2>
              <p>
                These terms may be updated; material changes will be announced on the site.
                Continued use after changes constitutes acceptance. Questions:{' '}
                <a
                  class="text-indigo-400 transition-colors hover:text-indigo-300"
                  href="mailto:support@latham.cloud"
                >
                  support@latham.cloud
                </a>
                .
              </p>
            </section>
          </div>

          <A href="/" class="mt-12 inline-block text-sm text-slate-500 hover:text-white">
            ← Back to home
          </A>
        </main>
        <Footer />
      </div>
    </>
  );
}
