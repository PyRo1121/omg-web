# OMG Web production recovery and SvelteKit migration research

**Date:** 2026-08-20  
**Status:** decision research; no runtime implementation  
**Confidence:** high for repository behavior, medium for production impact until remote Cloudflare, D1, Stripe, DNS, and OAuth state are inventoried

## Decision this research informs

Determine how to make the public site, docs, dashboard, admin dashboard, licensing, billing, telemetry, and Cloudflare deployments operate as one coherent product—and whether the SolidStart frontend should be replaced by Svelte 5/SvelteKit.

## Executive decision

1. **Freeze new dashboard/admin feature work.** Security and ownership failures are more urgent than framework work.
2. **Do not perform a big-bang SolidStart-to-Svelte rewrite.** The site includes approximately 22 API routes and roughly 5,000 lines of BFF/backend behavior in addition to about 110 Solid components and 34,000 TSX lines.
3. **Approve only a SvelteKit shadow foundation after preflight stabilization.** Production route migration is a no-go until the critical privacy/admin/auth issues, route drift, migrations, CI, and rollback baseline are fixed.
4. **Make the SaaS Worker and `omg-licensing` D1 the sole owners of licensing, subscriptions, entitlements, machines, and telemetry.** The site database should own Better Auth identity/session persistence only.
5. **Use one browser session authority.** Browser users should use a Better Auth `HttpOnly` cookie through a same-origin server/BFF. Do not mint a second browser bearer token or persist privileged credentials in `localStorage`.
6. **Keep the existing API Worker separate from SvelteKit initially.** Preserve its public contracts while they are corrected and versioned.
7. **Keep docs external until the actual Docusaurus source repository is audited.** Do not port the unused local Solid docs shell.
8. **Adopt one migration authority per D1 database and one reproducible workspace/package-manager model before production work resumes.**

## Evidence classification

- **Verified fact:** directly observed in repository source, installed package source/types, or current official platform documentation.
- **Inference:** likely impact derived from verified facts; production routing/data may alter the impact.
- **Recommendation:** target design selected to close the verified failure modes.
- **Unknown:** requires read-only production inventory or a product/legal policy decision.

---

## 1. Current product topology

### Verified local topology

| Surface                 | Runtime                              | Primary responsibility                                                     | Storage                                          |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `pyro1121.com`          | SolidStart/Vinxi on Cloudflare Pages | marketing, Better Auth, `/dashboard`, `/admin`, same-origin API/BFF routes | `omg-auth-db`                                    |
| `api.pyro1121.com`      | `omg-saas` Cloudflare Worker         | OTP, licensing, telemetry, billing, admin/CRM, analytics, downloads        | `omg-licensing`, nominal `omg-analytics`, KV, R2 |
| `/docs`                 | router Worker                        | reverse proxy and body rewriting to external Docusaurus Pages              | Cache API                                        |
| `releases.pyro1121.com` | release Worker                       | version metadata and release artifacts                                     | `omg-releases` R2                                |
| GitHub Releases         | external                             | installer-selected release source                                          | GitHub                                           |

Evidence:

- `site/app.config.ts:3-14`
- `site/wrangler.toml:1-17`
- `workers/api/wrangler.toml:1-39`
- `workers/router/wrangler.toml:5-13`
- `workers/releases/wrangler.toml:1-26`
- `site/public/install.sh:189-190`

### Root cause

The repository has **capability duplication**, not merely too many files:

- Better Auth cookie sessions and Worker bearer sessions have independent revocation domains.
- `omg-auth-db` and `omg-licensing` both contain mutable license/machine/usage representations.
- Same route names can mean different schemas and databases depending on origin.
- Site API handlers and Worker handlers both implement product operations.
- `/admin` and `/dashboard` expose overlapping admin surfaces.
- Two Workers and GitHub Releases overlap release delivery.
- Local docs components coexist with an externally deployed docs product.

A framework rewrite without resolving these ownership rules would preserve the failure modes under new syntax.

---

## 2. Immediate security blockers

### 2.1 Unauthenticated privacy export and deletion

#### Verified facts

`handleExportMyData` and `handleDeleteMyData` accept caller-provided email, license key, or machine ID without validating a customer session or verified data-subject workflow:

- `workers/api/src/handlers/privacy.ts:86-210`
- `workers/api/src/handlers/privacy.ts:288-390`
- `workers/api/tests/privacy.test.ts:192-209,334-384`

Concrete behavior:

- A known email can export profile/license metadata.
- A known email plus `confirm: true` can delete usage/notes and invalidate sessions/OTPs.
- A known machine ID can trigger unscoped `WHERE machine_id = ?` deletion across telemetry tables.
- Existing and missing emails produce distinguishable results, forming an enumeration oracle.
- A license key is treated as proof of data-subject authority despite being a shared CLI entitlement credential.

#### Required remediation

1. Public endpoints may create an asynchronous request case, but may not immediately disclose or mutate data.
2. For account holders, derive `customerId` exclusively from the authenticated server session.
3. Require recent reauthentication or a one-use capability bound to subject, operation, case ID, expiry, and nonce.
4. Use uniform external responses such as `202 accepted` for anonymous intake.
5. Scope machines by at least `(license_id, machine_id)` and preferably an immutable internal machine key.
6. Make deletion/export an idempotent workflow:
   `received → identity_verified → approved/denied → executing → completed/partial_failure`.
7. Export through an encrypted or one-use short-lived download with `Cache-Control: no-store`.

Primary sources:

- OWASP Broken Object Level Authorization: <https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/>
- OWASP Multi-Tenant Security: <https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html>
- OWASP reauthentication: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#require-re-authentication-for-sensitive-features>
- ICO identity verification for access requests: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/#CanWeAskForID>
- ICO right to erasure: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/>

This is security/engineering research, not legal advice.

### 2.2 Telemetry opt-out and retention are declarative only

#### Verified facts

- Privacy code writes and displays `telemetry_opt_out`, but reviewed ingestion paths do not read it.
- `/api/cli/event`, `/api/cli/batch`, `/api/report-usage`, and `/api/analytics` continue writing.
- Privacy status advertises 90-day telemetry, 30-day audit, and 12-month usage retention.
- The scheduled Worker invokes docs cleanup only.
- Docs cleanup catches and suppresses failures, so the outer Cron promise may report success.

Evidence:

- `workers/api/src/handlers/privacy.ts:530-605,621-652`
- `workers/api/src/handlers/telemetry.ts:153-176,319-461`
- `workers/api/src/handlers/license.ts:574-719,901-999`
- `workers/api/src/worker.ts:573-584`
- `workers/api/src/handlers/docs-analytics.ts:468-496`

#### Required remediation

- Create one authorization/preference gate used by every ingestion route before mutation.
- Separate essential security/licensing events from optional product analytics.
- Add indexed server-generated ingestion timestamps.
- Define a versioned retention policy per dataset/purpose.
- Run bounded purge jobs with watermarks, counts, structured failures, and alerts.
- Ensure cleanup failure rejects the scheduled promise.

Cloudflare scheduled handlers and Cron triggers:

- <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- <https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/>

### 2.3 Dual browser session authorities

#### Verified facts

#### Remediation status

The browser now has one session authority: the Better Auth `Secure`, `HttpOnly` cookie.

- Authenticated licensing calls terminate at the same-origin `/api/licensing/*` BFF.
- The BFF validates the Better Auth session and persisted role before every request.
- `LICENSING_API` privately invokes `omg-saas` through a Cloudflare Service Binding.
- The Worker token is minted at `/api/internal/site-session`, used only inside the BFF request, and never returned to JavaScript or persisted in browser storage.
- The BFF strips browser cookies, caller authorization, and caller admin-secret headers before forwarding.
- State-changing requests require a matching same-origin `Origin` header.
- Only explicit route/method pairs may cross the proxy.
- The old admin bridge, provisioning bridge, browser Worker logout, and `omg_session_token` paths have been removed.
- CLI/native bearer authentication remains separate from browser authentication.

#### Remaining risk

The BFF depends on the `LICENSING_API` service binding and the existing server-only `ADMIN_API_SECRET`; both production and preview environments must configure those bindings before cutover. Worker sessions remain reusable server-side for their existing lifetime, but Better Auth authorization gates every browser-originated use.

Primary sources:

- Better Auth session management: <https://better-auth.com/docs/concepts/session-management>
- Better Auth cookies: <https://better-auth.com/docs/concepts/cookies>
- Better Auth SvelteKit integration: <https://better-auth.com/docs/integrations/svelte-kit>
- Better Auth security: <https://better-auth.com/docs/reference/security>
- OWASP Session Management: <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- Cloudflare Service Bindings: <https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/>

### 2.4 OTP brute-force, RNG, storage, and replay

#### Verified facts

- OTP verification has no per-code, per-email, or per-IP attempt limit: `workers/api/src/handlers/auth.ts:315-347`.
- `AUTH_RATE_LIMITER` exists in configuration but is not applied by verification: `workers/api/wrangler.toml:47-51`.
- Research of the current handler found non-cryptographic OTP generation, plaintext OTP storage, and a select-then-update consume race.

#### Required remediation

- Use `crypto.getRandomValues` or equivalent CSPRNG.
- Store a keyed hash/HMAC, not the OTP value.
- Apply independent per-account/challenge and per-IP controls.
- Limit attempts per challenge and invalidate after the threshold.
- Atomically consume a code exactly once.
- Return generic failure responses and consistent timing.

Primary sources:

- OWASP Forgot Password: <https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html>
- OWASP OTP handling: <https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#one-time-password-otp-handling-and-storage>

---

## 3. Licensing and billing correctness

### 3.1 Client-controlled Stripe Price IDs

#### Verified facts

- Checkout accepts an arbitrary non-empty `priceId`: `workers/api/src/handlers/billing.ts:36-38`.
- It forwards the value directly as `line_items[0][price]`: `workers/api/src/handlers/billing.ts:133-150`.
- Configured Team/Enterprise price variables are not used as authorization.
- The frontend hardcodes price IDs and calls a different route without a Worker bearer token:
  `site/src/components/UpgradeModal.tsx:10-34,67-77`.

#### Target

The client sends a server-owned offer identifier and bounded seat count. A server catalog maps that to an allowlisted active Stripe Price/Product, interval, currency, environment, and seat policy. Every outbound Stripe mutation uses a stable idempotency key.

Stripe sources:

- Checkout subscriptions: <https://docs.stripe.com/payments/checkout/build-subscriptions>
- Price management/lookup keys: <https://docs.stripe.com/products-prices/manage-prices>
- Idempotent requests: <https://docs.stripe.com/api/idempotent_requests>

### 3.2 Webhook verification is incomplete; processing is non-idempotent

#### Positive verified behavior

The current handler reads the raw body, validates a timestamp window, computes HMAC-SHA256, and uses a timing-resistant comparison:

- `workers/api/src/handlers/billing.ts:70-119,253-268`

#### Defects

- Repeated `v1` signatures are collapsed into one Map value, complicating secret rotation.
- Only one webhook secret can be accepted.
- The event parser discards `event.id`, `created`, `livemode`, and API version.
- Event IDs are not persisted or deduplicated.
- The handler imperatively applies event arrival order even though Stripe does not guarantee ordering.
- Existing `stripe_events` and `webhook_dlq` tables are unused.

Evidence:

- `workers/api/src/contracts/stripe.ts:126-160`
- `workers/api/src/handlers/billing.ts:273-529`
- `workers/api/migrations/010_crm_enhancements.sql:184-200,396-408`

Stripe sources:

- Webhooks and duplicate/order behavior: <https://docs.stripe.com/webhooks>
- Signature verification: <https://docs.stripe.com/webhooks/signature>
- Subscription webhooks: <https://docs.stripe.com/billing/subscriptions/webhooks>

### 3.3 Canonical entitlement projection

Use Stripe events as **signals to reconcile current Stripe state**, not as assumed causal commands.

Recommended states:

| State       | Stripe source                                           | Paid access      |
| ----------- | ------------------------------------------------------- | ---------------- |
| `FREE`      | no recognized granting subscription                     | no               |
| `PENDING`   | `incomplete`                                            | no               |
| `TRIALING`  | `trialing`                                              | yes              |
| `ACTIVE`    | `active`                                                | yes              |
| `GRACE`     | `past_due` and grace not expired                        | product decision |
| `SUSPENDED` | grace expired, `unpaid`, `paused`, `incomplete_expired` | no               |
| `ENDED`     | canceled/deleted with no other granting subscription    | no               |

Rules:

- Scheduled cancellation remains active through effective period end.
- Duplicate or stale events do not extend grace.
- Tier/seats derive from recognized subscription items and quantity.
- Unknown Prices fail closed and alert operators.
- Multiple subscriptions are reconciled; deleting one must not revoke another valid grant.
- License validation reads the entitlement projection rather than independently mutable tier/status fields.

### 3.4 D1 inbox/outbox model

Recommended tables:

- `stripe_webhook_events`: event ID primary key, payload hash, status, lease, attempts, timestamps.
- `billing_plan_catalog`: allowlisted Price/Product mapping and seat policy.
- `billing_subscriptions`: reconciled Stripe snapshots.
- `account_entitlements`: canonical tier/state/seats/revision.
- `entitlement_outbox`: idempotent downstream actions.

Processing:

1. Verify raw body and every accepted signature/secret.
2. Insert-or-ignore event ID durably.
3. Claim a bounded processing lease.
4. Retrieve current Stripe subscription state when necessary.
5. Parse all items, quantities, status, cancellation, and environment.
6. Atomically batch subscription snapshot, entitlement projection, outbox, and processed marker.
7. Reclaim failed leases; quarantine permanent catalog/schema failures.
8. Run periodic Stripe-to-D1 reconciliation.

Cloudflare documents `D1.batch()` transactional rollback semantics:
<https://developers.cloudflare.com/d1/worker-api/d1-database/#batch>

### 3.5 License and usage protocol

#### Verified defects

- `omg-auth-db` still contains legacy license/machine/usage tables pending an explicit schema migration, but the site runtime no longer writes or synchronizes those mirrors.
- Usage requests lack a durable event/idempotency identifier.
- Counters accept negative, fractional, or impractically large finite numbers.
- Some validation paths accept keys in URLs.

#### Target

- `omg-licensing` is the sole authoritative writer; the dashboard reads it through the same-origin licensing BFF without synchronizing mutable state into `omg-auth-db`.
- Every usage report has an immutable `usage_event_id`, occurred-at time, device identity, schema version, and bounded non-negative integer metrics.
- Insert raw event and update aggregate atomically only on first acceptance.
- License credentials are stored as keyed hashes; raw keys are displayed once and never logged.
- Rotation increments a credential epoch.
- Offline tokens contain stable IDs, scope, entitlement revision, credential epoch, expiry, and signing-key ID—not the bearer key.

---

## 4. Contract and route ownership

### Confirmed route drift

| Client                             | Worker                          |
| ---------------------------------- | ------------------------------- |
| `/api/create-checkout`             | `/api/billing/checkout`         |
| `/api/site/analytics/events`       | `/api/site/analytics/track`     |
| `/api/admin/export-users`          | `/api/admin/export/users`       |
| `/api/admin/export-usage`          | `/api/admin/export/usage`       |
| `/api/team/members/revoke`         | `/api/team/revoke`              |
| `POST /api/team/thresholds`        | no corresponding route found    |
| team policy/notification mutations | Worker exposes GET placeholders |

Evidence:

- `site/src/components/UpgradeModal.tsx:67-77`
- `site/src/lib/analytics-client.ts:20`
- `site/src/lib/api.ts:350-431,619-654`
- `workers/api/src/worker.ts:219-222,330-348,402-414,485-488`

### Required model

Create one capability-scoped contract package containing:

- owning service;
- method and path;
- request schema;
- success schema;
- stable error codes/envelope;
- auth and scope requirement;
- compatibility/deprecation policy.

Generate or statically verify clients and dispatch tables against it. Keep persistence row schemas private to their owning service. The UI must decode `unknown` responses before state/query-cache mutation.

Target capability ownership:

```text
identity/       Better Auth browser identity and current principal
licensing/      license credentials, activations, machines
billing/        Stripe catalog, subscriptions, entitlements
telemetry/      CLI/device ingestion and usage events
admin/          authorized CRM/reporting operations
web-analytics/  site/docs analytics and retention
releases/       version metadata and artifacts
```

---

## 5. Cloudflare and database operations

### 5.1 One migration authority per database

#### Verified facts

Repository authority is now consolidated:

- `workers/api/migrations/` is the only configured licensing migration directory.
- `0000_current_baseline.sql` captures the reconciled schema through legacy migration 010.
- migrations 011 and 012 remain immutable incremental migrations for Stripe inbox leases and bounded OTP attempts.
- historical migrations are preserved byte-for-byte under `workers/api/migrations-legacy/`, outside Wrangler's configured migration directory.
- Worker tests apply the exact configured migration sequence through Cloudflare's `readD1Migrations` and `applyD1Migrations` APIs.
- manual schema files, direct-file migration scripts, the alternate test schema, and runtime `/api/init-db` initialization have been removed.
- the licensing Worker no longer binds the unused `ANALYTICS_DB` or legacy KV namespaces; release analytics retains separate ownership of its analytics database.

Production remains intentionally unapplied. The current remote schema and `d1_migrations` history have not been inventoried, so the baseline must not be recorded remotely based on repository assumptions.

#### Required production adoption plan

1. Perform read-only inventory of the production schema and `d1_migrations`.
2. Confirm the deployed database already satisfies the baseline-through-010 contract.
3. Reconcile any drift with a new forward-only migration; never edit the baseline or migrations 011/012.
4. Back up or bookmark Time Travel before applying pending migrations.
5. Apply through Wrangler migration list/apply commands only.
6. Use expand → compatible code → backfill → contract sequencing for every later schema change.

Cloudflare D1 migration references:

- <https://developers.cloudflare.com/d1/reference/migrations/>
- <https://developers.cloudflare.com/d1/wrangler-commands/>
- Time Travel: <https://developers.cloudflare.com/d1/reference/time-travel/>

### 5.2 Reproducible build and package ownership

#### Verified facts

- Root CI runs only `npm ci` and `npm run check`: `.github/workflows/ci.yml`.
- Root is not an npm workspace.
- Site and Worker have separate manifests and lockfiles.
- Site scripts invoke Bun while root CI uses npm.
- Both npm and Bun locks exist with divergent package metadata.
- Root formatting still references deleted `eslint.config.js`.
- Nested site/Worker lint scripts still invoke ESLint.
- Root still carries ESLint dependencies despite the intended Oxlint-only policy.

Evidence:

- `package.json`
- `site/package.json`
- `workers/api/package.json`
- `site/package-lock.json`
- `site/bun.lock`

#### Required decision

Adopt one pinned package manager and root workspace/lock. The clean-checkout gate must install every package, generate/check binding types, typecheck, test, build, and perform Wrangler dry runs.

### 5.3 Observability, retention, and promotion

- Enable Workers Logs in version-controlled Wrangler configuration.
- Tag every structured event with environment, service, version, request ID, capability, and outcome.
- Alert on route 5xx, latency, D1 failures, missing/failed Cron runs, and release 404/503 rates.
- Use external storage/Logpush when retention beyond Workers Logs limits is required.
- Keep Sentry environment configuration environment-specific.
- Treat Worker deployment as versioned code/config only; D1/R2/KV state is not rolled back with code.
- Apply only backward-compatible expand migrations before gradual code promotion.
- Roll back code to a compatible previous version; use forward corrective migrations by default.

Sources:

- Workers Logs: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
- Versions and deployments: <https://developers.cloudflare.com/workers/versions-and-deployments/>
- Gradual deployments: <https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/>
- Pages rollback: <https://developers.cloudflare.com/pages/configuration/rollbacks/>

### 5.4 Docs and releases

#### Docs

The router buffers and regex-rewrites HTML, CSS, and JavaScript and uses the data-center-local Cache API. Preferred outcomes:

1. Deploy docs with a correct base path and redirect `/docs` to a docs custom domain; or
2. Build Docusaurus for `/docs` so pass-through proxying requires no body rewrite.

Do not port local `site/src/components/docs/**` until runtime references prove those components are active.

Cloudflare cache references:

- <https://developers.cloudflare.com/workers/reference/how-the-cache-works/>
- <https://developers.cloudflare.com/workers/runtime-apis/cache/>

#### Releases

The API Worker and release Worker use different R2 buckets but overlap download responsibility. Designate `releases.pyro1121.com` as the likely canonical version/artifact origin only after inventorying CLI and external consumers. Do not remove existing paths without compatibility evidence.

---

## 6. Svelte 5/SvelteKit decision

### Current decision

- **Production migration: no-go today.**
- **Preflight and shadow foundation: conditional go.**

A 6–8 week full migration is not credible unless major dashboard/admin scope is deleted. Research estimates **25–43 engineer-weeks** for full parity under the stated assumptions, or roughly 13–22 calendar weeks with two senior engineers, excluding product redesign and the external docs repository.

### Must-fix before migration starts

1. Restore a clean intentional working tree.
2. Restore green site typecheck. Current verified error:
   `site/src/components/GitHubActivity.tsx:58` (`readonly` array assigned to mutable signal state).
3. Remove the dashboard secret fallback:
   `site/src/routes/dashboard.tsx:21-22`.
4. Server-protect `/admin` and remove browser-persisted privileged bearer authority.
5. Choose one package manager/lockfile and fix clean-checkout CI.
6. Add route/API/browser characterization and Playwright coverage.
7. Correct critical privacy, auth, billing, and route mismatches.
8. Establish migration, staging, observability, and rollback ownership.
9. Capture current cookie/OAuth, route, bundle, and Core Web Vitals baselines.

### Alchemy deployment decision (2026-08-25)

The migration uses Alchemy as the deployment authority for the new Svelte runtime. The compatibility boundary is intentionally exact rather than semver-wide: Alchemy `2.0.0-beta.74`, Effect `4.0.0-rc.112`, SvelteKit `3.0.0-next.9`, `@sveltejs/vite-plugin-svelte` `7.2.0`, and Vite `8.2.1`. Alchemy's published SvelteKit peer range accepts newer Kit 3 prereleases, but its adapter-injection API does not; `next.25` failed before upload and confirmed that lockfile updates require deployment-level verification.

Alchemy injects its Cloudflare adapter in memory. The Svelte package therefore has no `svelte.config`, Wrangler deployment config, or `@sveltejs/adapter-cloudflare` dependency. `assets.runWorkerFirst` is required so browser HTML requests reach SvelteKit instead of terminating in the static-asset 404 fallback. Alchemy state uses its encrypted Cloudflare Worker/Durable Object backend; application state remains in the existing D1.

The coexistence package is `site-svelte/`. It owns only the generated shadow Worker until a complete URL-path slice passes characterization. Existing production Workers and D1 are not bulk-adopted: every future Alchemy adoption requires a resource-specific plan and rollback gate, and `--adopt` must never be applied indiscriminately to the whole production stack.

**Auth compatibility gate:** Better Auth's SvelteKit integration requires APIs introduced in SvelteKit `2.20.0` and remains API-compatible with the exact-tested SvelteKit `3.0.0-next.9`, but Better Auth `1.7.1` still publishes a stale `@sveltejs/kit: ^2` optional peer range. `site-svelte/package.json` uses a package-scoped npm override to resolve only that peer to the repository's exact SvelteKit version; it does not enable global legacy-peer behavior. The exact combination passes strict checks, production build, Alchemy deployment, anonymous session lookup, invalid-password rejection, and disabled-signup characterization on the isolated shadow. Keep the override until Better Auth widens its peer metadata, and re-run the full live gate before changing either pin. The shadow uses a separate Alchemy-generated secret, so this proves runtime compatibility—not production session continuity or OAuth readiness.

### Target SvelteKit structure

```text
site-svelte/
├── alchemy.run.ts
├── vite.config.ts
└── src/
    ├── app.html
    ├── app.d.ts
    ├── hooks.server.ts
    ├── lib/
    │   ├── contracts/          # Effect Schema wire contracts
    │   ├── domain/             # pure decisions
    │   ├── application/        # Effect services
    │   ├── state/
    │   │   ├── dashboard-view.svelte.ts
    │   │   ├── admin-view.svelte.ts
    │   │   └── realtime-view.svelte.ts
    │   ├── components/
    │   └── server/
    │       ├── auth.ts
    │       ├── authorization.ts
    │       ├── cloudflare-env.ts
    │       └── worker-api.ts
    └── routes/
        ├── +layout.svelte
        ├── +error.svelte
        ├── (marketing)/+page.svelte
        ├── (auth)/login/
        ├── (auth)/signup/
        ├── (account)/+layout.server.ts
        ├── (account)/dashboard/+page.server.ts
        ├── (account)/dashboard/+page.svelte
        ├── (admin)/+layout.server.ts
        ├── (admin)/admin/+page.server.ts
        ├── (admin)/admin/+page.svelte
        ├── api/auth/[...auth]/+server.ts
        ├── api/... stable HTTP contracts
        ├── robots.txt/+server.ts
        └── sitemap.xml/+server.ts
```

Official SvelteKit basis:

- Routing: <https://svelte.dev/docs/kit/routing>
- Loading data: <https://svelte.dev/docs/kit/load>
- Hooks/locals: <https://svelte.dev/docs/kit/hooks>
- Server-only modules: <https://svelte.dev/docs/kit/server-only-modules>
- Authentication: <https://svelte.dev/docs/kit/auth>
- Alchemy SvelteKit deployment: <https://alchemy.run/cloudflare/frontend/sveltekit>
- Cloudflare adapter behavior reference: <https://svelte.dev/docs/kit/adapter-cloudflare>
- Svelte runes: <https://svelte.dev/docs/svelte/what-are-runes>
- Testing: <https://svelte.dev/docs/svelte/testing>
- `sv check`: <https://svelte.dev/docs/cli/sv-check>

### Runes and Effect rules

- `.svelte` files remain thin markup/event bridges.
- `$state` owns view state.
- `$derived` owns pure computed state.
- `$effect` is reserved for external synchronization such as browser APIs, timers, analytics, WebSockets, and visualization lifecycles.
- Effect application services and schemas remain framework-neutral.
- Ground Effects at route/view-model boundaries and map typed outcomes into rune-backed state.
- Do not put network orchestration and business rules into component effects.
- Decode API, form, storage, and persistence input before mutating state.

### Safe coexistence

Solid and Svelte should coexist only at **complete URL-path deployment boundaries**:

1. Deploy SvelteKit through the `OmgSvelteSite` Alchemy stack to a stage-specific shadow hostname.
2. Keep the Solid deployment immutable and routable.
3. Route an explicit path allowlist at the edge.
4. Move complete pages/endpoints, not components.
5. Preserve public hostnames, cookie names/attributes, OAuth callbacks, and API paths.
6. Roll back by removing the Svelte path from the allowlist.

Cross-framework navigation may require full-document transitions; in-memory state and layouts do not cross runtimes.

### Recommended slices

| Slice | Scope                              | Gate                                                                                                                    |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0     | stabilization and characterization | clean install/check/test/build, route matrix, cookie/OAuth baseline, Playwright, rollback design                        |
| 1     | shadow SvelteKit shell             | `svelte-check`, strict TS, Alchemy plan/deploy, health/robots/sitemap parity, browser HTML smoke, no production traffic |
| 2     | auth foundation and login/signup   | exact cookies/callbacks, CSRF/trusted origins, login/logout/OAuth E2E                                                   |
| 3     | marketing home                     | SSR/SEO/accessibility/visual parity, lazy Three.js, analytics contract                                                  |
| 4     | account dashboard                  | server auth/load, no hydration duplicate fetch, schema decoding, lifecycle cleanup                                      |
| 5     | admin by tab                       | server authorization, query/table parity, mutation outcomes, accessibility/visual tests                                 |
| 6     | site API families                  | method/status/header/schema compatibility and local D1/KV integration                                                   |
| 7     | cutover/removal                    | observation window, rollback exercise, remove Solid dependencies and compatibility paths together                       |

Do not mix Docusaurus migration, Worker domain redesign, D1 migration, and Svelte UI work in the same slice.

---

## 7. Production-readiness gate

A protected pull request should pass from a clean checkout:

1. **Repository hygiene:** clean tree, generated-artifact and lockfile consistency.
2. **Immutable install:** one pinned package manager and frozen workspace install.
3. **Static quality:** formatter, Oxlint/anti-slop, generated Wrangler binding types, strict TypeScript/Svelte checks.
4. **Unit/domain tests:** Effect schemas, domain rules, state machines, view-model behavior.
5. **Worker integration tests:** privacy/auth/OTP, Stripe webhook, licensing, usage idempotency, Cron, router, releases.
6. **Database verification:** apply canonical migrations to empty databases and prior-version fixtures.
7. **Contract verification:** every public method/path/request/response/auth tuple matches its client and owner.
8. **Production artifacts:** site build, required-output assertions, Wrangler dry run for each Worker.
9. **Browser tests:** login/OAuth/logout, license flow, dashboard, admin denial, mobile layouts, exports.
10. **Security checks:** secret scan, pinned dependency audit, body/rate limits, credential redaction.
11. **Staging:** isolated D1/KV/R2, migrations, scheduled handler, observability, and smoke tests.
12. **Promotion:** backward-compatible migrations first, version upload, gradual traffic, observation, explicit approval.

---

## 8. Ordered recovery roadmap

### Phase 0 — emergency containment

1. Disable or authenticate immediate privacy export/delete.
2. Server-guard `/admin`.
3. Revoke/clear Worker browser sessions on logout; remove stale-token suppression.
4. Remove full license-key logging.
5. Close arbitrary Stripe Price authorization.
6. Correct checkout, analytics, exports, and team route mismatches.

### Phase 1 — establish authority

1. Make `omg-licensing` authoritative for licenses, machines, usage, subscriptions, and entitlements.
2. Stop site-side license creation, validation, usage ingestion, and client-triggered mirroring.
3. Introduce immutable Better Auth user-ID mapping, not email authority.
4. Standardize versioned HTTP contracts and errors.
5. Define the canonical billing entitlement and usage-event state machines.

### Phase 2 — operations foundation

1. Read-only inventory of remote Cloudflare resources and schemas.
2. Establish one D1 migration chain per database.
3. Standardize npm/Bun and workspaces/locks.
4. Add missing test/build/dry-run CI gates.
5. Enable observability and truthful Cron failure behavior.
6. Establish isolated staging, gradual promotion, and rollback runbooks.

### Phase 3 — delete proven dead paths

1. Confirm and delete local docs shell if external Docusaurus remains authoritative.
2. Remove duplicate user/admin dashboard implementations and backups.
3. Remove obsolete site API implementations after caller inventory.
4. Remove runtime database initialization and schema snapshots from operational paths.
5. Consolidate release/download ownership after external-client inventory.

### Phase 4 — SvelteKit migration

Execute the path-level slices described above. Keep the old Solid deployment available until each path has passed its observation window and rollback exercise.

---

## 9. Unknowns requiring read-only production inventory

Do not infer these from repository configuration:

- actual deployed Workers, Pages projects, routes, custom domains, triggers, and dashboard-only bindings;
- live D1 schemas and `d1_migrations` contents;
- whether `ANALYTICS_DB` contains live data or is unused;
- active Better Auth and Worker sessions, duplicate customer emails, and role drift;
- Stripe live/test Products, Prices, API version, webhook secrets/events, dunning policy, and seat model;
- external CLI consumers of validation, usage, release, and docs URLs;
- Cloudflare plan-dependent log and Time Travel retention;
- actual OAuth callback and cookie behavior in production;
- legal retention requirements and controller/processor obligations;
- acceptable forced-reauthentication and downtime policy.

Remote inventory must be read-only, redacted, and captured before designing migrations or deleting compatibility paths.

---

## 10. Verification performed

- Five independent read-only research tracks: privacy/security, auth/sessions, Stripe/licensing, Cloudflare operations, and SvelteKit migration.
- Repository source and installed Better Auth 1.6.29 behavior inspected.
- Current official Stripe, Better Auth, OWASP, regulator, Cloudflare, and Svelte/SvelteKit documentation reviewed.
- Current site typecheck re-run; one pre-existing working-tree error confirmed at `site/src/components/GitHubActivity.tsx:58`.
- No production resources were queried.
- No runtime source was modified by this research.

### Pre-existing working-tree state

At research time:

- modified: `site/src/components/GitHubActivity.tsx`
- modified: `site/src/lib/dashboard-contract.ts`
- untracked: `site/src/lib/dashboard-contract.test.ts`

This research note was added without altering those changes.
