import { Title, Meta, Link } from '@solidjs/meta';
import { A } from '@solidjs/router';
import Footer from '~/components/Footer';
import Header from '~/components/Header';

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

      <div class="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <Header />
        <main class="manifest-shell px-6 py-16 sm:px-10 sm:py-24">
          <p class="manifest-index">LEGAL / PRIVACY</p>
          <h1 class="mt-4 text-6xl font-black tracking-[-0.06em] uppercase sm:text-8xl">
            Privacy policy
          </h1>
          <p class="mt-4 border-b border-[var(--ink)] pb-8 font-mono text-xs text-[var(--ink-muted)]">
            Version 2.0 / Last updated February 7, 2026
          </p>

          <div class="max-w-3xl space-y-10 pt-10 text-sm leading-relaxed text-[var(--ink-muted)]">
            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                What we collect
              </h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>
                  <strong class="text-[var(--ink)]">Account data:</strong> your email address,
                  display name, and OAuth provider identifiers when you sign in.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">License and billing data:</strong> license keys,
                  tier, seat assignments, machine registrations, and Stripe payment records.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Telemetry (opt-out):</strong> anonymized CLI
                  usage such as command counts, package names, durations, and platform info, tied to
                  your license. Customers can disable telemetry at any time from the dashboard or
                  via the API.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                Data retention
              </h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>Telemetry events: 90 days</li>
                <li>Audit logs: 30 days</li>
                <li>Usage statistics: 12 months</li>
                <li>Payment records: retained per Stripe requirements</li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                Your rights
              </h2>
              <p class="mb-3">These rights are available to all users regardless of location:</p>
              <ul class="list-disc space-y-2 pl-5">
                <li>
                  <strong class="text-[var(--ink)]">Access and portability:</strong> export your
                  data as JSON from the dashboard settings or via POST /api/privacy/export.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Deletion:</strong> delete your telemetry and
                  account data via POST /api/privacy/delete. Deletion is irreversible; audit logs
                  are retained for 30 days for security purposes and payment records per Stripe
                  requirements.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Opt-out:</strong> stop telemetry collection at
                  any time via POST /api/privacy/opt-out or the dashboard.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">Contact</h2>
              <p>
                Questions or requests regarding this policy can be sent to{' '}
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
