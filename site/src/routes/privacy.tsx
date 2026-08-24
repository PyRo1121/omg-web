import { Title, Meta, Link } from '@solidjs/meta';
import { A } from '@solidjs/router';
import Footer from '~/components/Footer';

/**
 * Privacy policy page. The canonical machine-readable summary is served by
 * GET /api/privacy/status (`privacy_policy_version` 2.0); keep this page in
 * step with that contract when retention periods or rights change.
 */
export default function PrivacyPage() {
  return (
    <>
      <Title>Privacy Policy - OMG Package Manager</Title>
      <Meta
        name="description"
        content="How OMG Package Manager collects, uses, and protects your data: telemetry opt-out, data export, deletion, and retention periods."
      />
      <Link rel="canonical" href="https://omg.latham.cloud/privacy" />

      <div class="min-h-screen bg-[#0a0a0a] text-slate-200">
        <main class="mx-auto max-w-3xl px-6 py-16">
          <h1 class="mb-2 text-3xl font-bold text-white">Privacy Policy</h1>
          <p class="mb-10 text-sm text-slate-500">Version 2.0 · Last updated February 7, 2026</p>

          <div class="space-y-8 text-sm leading-relaxed text-slate-300">
            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">What we collect</h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>
                  <span class="text-white">Account data:</span> your email address, display name,
                  and OAuth provider identifiers when you sign in.
                </li>
                <li>
                  <span class="text-white">License and billing data:</span> license keys, tier, seat
                  assignments, machine registrations, and Stripe payment records.
                </li>
                <li>
                  <span class="text-white">Telemetry (opt-out):</span> anonymized CLI usage such as
                  command counts, package names, durations, and platform info, tied to your license.
                  Customers can disable telemetry at any time from the dashboard or via the API.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">Data retention</h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>Telemetry events: 90 days</li>
                <li>Audit logs: 30 days</li>
                <li>Usage statistics: 12 months</li>
                <li>Payment records: retained per Stripe requirements</li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">Your rights</h2>
              <p class="mb-3">These rights are available to all users regardless of location:</p>
              <ul class="list-disc space-y-2 pl-5">
                <li>
                  <span class="text-white">Access and portability:</span> export your data as JSON
                  from the dashboard settings or via POST /api/privacy/export.
                </li>
                <li>
                  <span class="text-white">Deletion:</span> delete your telemetry and account data
                  via POST /api/privacy/delete. Deletion is irreversible; audit logs are retained
                  for 30 days for security purposes and payment records per Stripe requirements.
                </li>
                <li>
                  <span class="text-white">Opt-out:</span> stop telemetry collection at any time via
                  POST /api/privacy/opt-out or the dashboard.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-lg font-semibold text-white">Contact</h2>
              <p>
                Questions or requests regarding this policy can be sent to{' '}
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
