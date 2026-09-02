import { Title, Meta, Link } from '@solidjs/meta';
import { A } from '@solidjs/router';
import Footer from '~/components/Footer';
import Header from '~/components/Header';

/**
 * Privacy policy page. The canonical machine-readable summary is served by
 * GET /api/privacy/status (`privacy_policy_version` 2.1); keep this page in
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
      <Link rel="canonical" href="https://omg.latham.cloud/privacy/" />

      <div class="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <Header />
        <main class="manifest-shell px-2 pt-32 pb-24 sm:px-0 sm:pt-40">
          <p class="font-mono text-xs text-[var(--signal)]">Privacy and data rights</p>
          <h1 class="mt-6 text-6xl font-medium tracking-[-0.06em] sm:text-8xl">Privacy policy</h1>
          <p class="mt-6 border-b border-[var(--rule)] pb-8 font-mono text-xs text-[var(--ink-muted)]">
            Version 2.1 / Last updated September 1, 2026
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
                  <strong class="text-[var(--ink)]">Machine registrations:</strong> machine names,
                  platforms, and activity timestamps linked to your account.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">CLI telemetry (opt-out):</strong> pseudonymous
                  command usage, package and runtime names, durations, errors, platform information,
                  and performance measurements.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Website analytics:</strong> page paths or
                  documentation URLs, interactions, performance measurements, referrer domains,
                  campaign parameters, browser and device categories, and Cloudflare-provided
                  country and city. Documentation analytics may retain a truncated user-agent
                  string. Application analytics does not store your raw IP address.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Security records:</strong> session times, IP
                  addresses, user agents, and authentication or account-change audit events used to
                  protect accounts and investigate abuse.
                </li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                How we use data
              </h2>
              <p>
                We use data to provide and secure accounts, dashboards, support, and email; operate
                and improve OMG; measure reliability and feature adoption; prevent abuse; and
                satisfy legal obligations. We do not sell personal information or use it for
                targeted advertising.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                Cookies and identifiers
              </h2>
              <p>
                Sign-in uses an essential secure session cookie. Public website analytics uses no
                cookies, local storage, or session storage. The analytics service derives a daily
                rotating pseudonymous visitor identifier from the request IP address and user agent;
                raw IP addresses may still appear in bounded security and authenticated-session
                records. Global Privacy Control and browser Do Not Track prevent public analytics
                from starting.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                Service providers
              </h2>
              <p>
                Cloudflare provides hosting, database, network, security, and email infrastructure.
                GitHub provides OAuth sign-in. These providers process data needed to deliver their
                services under their own terms and privacy commitments.
              </p>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                Data retention
              </h2>
              <ul class="list-disc space-y-2 pl-5">
                <li>Raw CLI and website analytics events: 90 days</li>
                <li>Raw documentation analytics events: 7 days; documentation sessions: 30 days</li>
                <li>Audit logs: 30 days</li>
                <li>Aggregate and per-machine usage statistics: 12 months</li>
                <li>Account and organization records: while needed to provide the service</li>
              </ul>
            </section>

            <section>
              <h2 class="mb-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                Your rights
              </h2>
              <p class="mb-3">These rights are available to all users regardless of location:</p>
              <ul class="list-disc space-y-2 pl-5">
                <li>
                  <strong class="text-[var(--ink)]">Access and portability:</strong> request a
                  portable copy from support.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Deletion:</strong> request deletion from
                  support. Deletion is irreversible; audit logs are retained for 30 days for
                  security purposes.
                </li>
                <li>
                  <strong class="text-[var(--ink)]">Opt-out:</strong> request a telemetry opt-out
                  from support.
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
