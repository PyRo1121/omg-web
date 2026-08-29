# Svelte production cutover and Solid removal

**Status:** implementation parity complete; authenticated characterization and cutover pending

**End state:** SvelteKit owns `omg.latham.cloud`; `omg-site` and the Solid/Vinxi tree are deleted after the observation window
**Selected decisions:** preserve offer/Stripe checkout; use a coordinated logout instead of cross-runtime session continuity

This plan complements [`svelte-auth-cutover.md`](./svelte-auth-cutover.md). That document owns Better Auth rotation mechanics; this document owns the complete runtime migration and removal sequence.

## 1. Invariants

- `omg-saas` remains the licensing, billing, telemetry, and admin-data authority.
- Browser requests never call `omg-saas` directly. Svelte server code uses the private `LICENSING_API` Service Binding and projects bounded browser-safe data.
- Wrangler remains the sole D1 migration authority through `site/workers/migrations/`.
- Alchemy owns only the Svelte Worker, its bindings, secrets, observability, and eventual domain attachment.
- Existing Workers are not adopted into Alchemy to simplify routing.
- The production hostname has one browser-session authority at a time.
- No production path is moved until its complete page, actions/endpoints, assets, error behavior, and rollback check pass.
- Temporary coexistence has a removal gate. No proxy or compatibility route survives final cutover.

## 2. Routing designs considered

### A. Path-route overlay

Cloudflare Worker Routes can take precedence over a Custom Domain on the same hostname, and the most-specific matching route wins. A broad Svelte route plus narrower Solid exceptions is technically viable.

Rejected as the default production plan because preserving authenticated checkout while using a coordinated logout couples `/`, `/login`, `/api/auth/*`, `/dashboard`, and billing session verification. Moving only `/` would either remove checkout or make Svelte unable to validate the Solid-authenticated cookie. The overlay would also split zone-route ownership between Wrangler and Alchemy and require a protected-prefix manifest until removal.

Retain this design only as an emergency or explicitly bounded prefix migration for independent pages such as `/docs/`; do not use it to create a long-lived mixed application.

### B. Shadow parity, then one hostname transfer — selected

Continue implementing complete slices on the isolated Svelte shadow. Once public, auth, billing, account, admin, and required BFF behavior pass their gates, transfer the production Custom Domain once, perform the selected coordinated logout, observe, then delete Solid.

This keeps the code migration incremental while making the traffic cutover atomic. Rollback restores the hostname to `omg-site`; users may need to authenticate again because session continuity is intentionally not preserved.

### C. Svelte front door with a legacy Solid binding

Rejected. Forwarding unported paths or auth calls from Svelte to Solid adds a compatibility runtime, a second failure domain, and an easy path to indefinite Solid retention. It also conflicts with complete-path migration and removal requirements.

## 3. Current parity and blockers

| Capability                           | Svelte shadow                                                                                                                 | Gate before production                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Home, docs, privacy, terms, metadata | Implemented with canonical metadata, checkout, and first-party analytics                                                      | Final anonymous desktop/compact characterization               |
| Login/signup and Better Auth         | Implemented with an isolated secret and GitHub app                                                                            | Production callback inputs plus coordinated logout/cookie gate |
| Account and organization workspaces  | Implemented with private licensing, billing, usage, fleet, invitations, membership, ownership, and audit flows                | Authenticated role/tier characterization                       |
| Operator workspaces                  | Command center, customers, organizations, analytics, insights, revenue, audit, exports, and bounded live activity implemented | Authenticated operator characterization                        |
| Solid BFF routes                     | Replaced by SvelteKit server loads, actions, same-origin endpoints, and private Service Binding calls                         | Caller-free check, hostname transfer, and observation          |
| Static assets/installers/public key  | Required artifacts copied to `site-svelte/static` with fixed hash tests                                                       | Production-path smoke checks after hostname transfer           |

## 4. Migration tickets

### M1 — Svelte offer and billing vertical slice

- Add a thin Svelte interaction surface for the existing marketing offer.
- Parse email, offer, promotion code, and checkout session identifiers with shared Effect schemas.
- Call `omg-saas` only through `LICENSING_API`; never expose Worker sessions, Stripe IDs, customer IDs, or secrets to page data except the browser-required Checkout redirect URL and bounded fulfillment status.
- Preserve authenticated Checkout creation, promotion-code application, success/cancel redirects, and post-checkout fulfillment status.
- Keep components limited to markup, rune-backed view state, and event bridges.
- Add focused domain/service/action-result tests and shadow browser verification.

**Removal unlocked:** Solid `MarketingOfferDialog`, `UpgradeModal`, `/api/offer`, and checkout-specific browser helpers after hostname cutover.

### M2 — Complete protected-surface scope

- Decide which legacy dashboard/admin capabilities are real product requirements and explicitly delete fabricated/obsolete surfaces rather than porting them.
- Finish required Svelte customer operations and the named operational routes already approved for the console.
- Add route-level tests for named actions, confirmation failures, forbidden users, Worker degradation, successful mutations, and detail reload failure.

**Removal unlocked:** Solid dashboard/admin components and their browser data stores after cutover.

### M3 — Production auth preparation

- Provision production-stage GitHub inputs without reusing shadow credentials.
- Use a fresh Svelte production Better Auth secret.
- Keep GitHub as the only social provider and public password signup disabled.
- Schedule the coordinated logout: remove stale `auth_session` rows immediately before hostname transfer and require reauthentication.
- Verify callback, cookie attributes, limiter behavior, disabled signup, sign-out cleanup, and admin role projection.

**Removal unlocked:** Solid Better Auth route and auth runtime after observation.

### M4 — Replace required Solid BFF families

- Prefer Svelte server loads/actions over recreating browser JSON endpoints when only Svelte pages consume the behavior.
- Preserve an HTTP endpoint only when an external or still-supported caller exists.
- For every retained endpoint, verify method, status, headers, body bounds, schema, authorization, origin/CSRF behavior, and degraded-state semantics.
- Remove each superseded Solid endpoint and helper in the same slice; do not retain fallbacks.

### M5 — Production-stage rehearsal

- Produce a clean Alchemy production plan that manages only the Svelte Worker and intended domain resource.
- Do not use `--adopt` for `omg-site`, `omg-saas`, or D1.
- Verify production-stage bindings and secrets without printing values.
- Run full automated checks and user-controlled Helium verification on the shadow.
- Record exact domain transfer and rollback commands immediately before the window.

### M6 — Atomic hostname cutover

1. Freeze deployments and confirm both repositories/CI are green.
2. Back up/bookmark D1 and record the current Worker versions.
3. Clear stale Better Auth sessions for the coordinated logout.
4. Detach `omg.latham.cloud` from `omg-site` and attach it to the Alchemy Svelte production Worker.
5. Run anonymous, GitHub OAuth, dashboard, admin, offer, checkout, fulfillment, legal, SEO, CSP, and installer gates.
6. Roll back the hostname immediately on any failed gate. Do not patch forward during the window.

### M7 — Observation and deletion

After the agreed observation window:

- remove the Solid Custom Domain and any obsolete route resources;
- delete `site/src`, Solid/Vinxi dependencies, Solid-only tests, build tooling, and BFF compatibility code;
- retain `site/shared`, `site/workers`, canonical migrations, public installer/key artifacts, and only the tooling still owned by those surfaces;
- rename/restructure retained directories only in a separate cleanup after deletion, not during cutover;
- update topology, incident, rollback, dependency, and audit documentation.

## 5. Proof obligations

- No browser-visible token, license key, provider/customer/database identifier, or machine identifier is introduced.
- Every untrusted form, Worker, Stripe, D1, URL, and storage boundary is decoded before state mutation.
- Missing bindings, client address, secrets, session, role, or malformed private responses fail closed.
- Public pages preserve canonical metadata, JSON-LD safety, sitemap/robots behavior, accessibility, and script nonce/hash CSP.
- Checkout remains idempotent and server-catalog-authorized; webhook processing remains the entitlement authority.
- The Svelte initial bundle stays within the existing budget.
- Final source and deployment inventory contains no Solid runtime path.

## 6. M1 implementation progress

- [x] Target Worker independently accepts `SVELTE_BFF_SECRET` for private marketing-offer calls while retaining `ADMIN_API_SECRET` for existing callers.
- [x] Svelte offer form/action bounds the request stream, schema-decodes inputs and responses, classifies failures, and projects only the public promotion code.
- [x] Shadow deployment, no-op plan, live offer creation, anonymous Checkout fail-closed behavior, and private-identifier projection checks.
- [x] Authenticated Checkout creation with exact offer parsing and an allowlisted Stripe redirect.
- [x] Bounded post-checkout fulfillment status with no session id, email, license key, or provider identifier in page data/DOM.
- [ ] User-controlled authenticated checkout characterization.

Do not attach production routes before the coordinated cutover. Do not enable Stripe Tax until registrations and liability jurisdictions are established. Automated implementation parity does not replace user-controlled authenticated characterization.

## 7. Caller-checked Solid deletion manifest

Every path below is classified **remove after successful hostname observation**. The replacement class is determined by its prefix:

| Solid prefix                                                                                           | Replacement authority                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `site/src/routes`, `site/src/entry-*`, `site/src/app.*`, `site/src/middleware*`                        | SvelteKit routes, hooks, server loads/actions, and Alchemy Worker runtime                        |
| `site/src/components`, `site/src/pages`, `site/src/design-system`                                      | Svelte components and route-local presentation                                                   |
| `site/src/lib/analytics-client.ts`, `site/src/lib/performance-entry*`                                  | Same-origin Svelte analytics view model and Service Binding endpoint                             |
| `site/src/lib/contracts`, `site/src/lib/licensing-bff*`, `site/src/lib/admin.ts`, `site/src/lib/auth*` | Effect Schema Svelte server boundaries and retained `site/shared` contracts                      |
| remaining `site/src/lib` and `site/src/types`                                                          | Superseded Solid-only state, fetch, formatting, helper, and test modules with no retained caller |

`tools/check-source-policy.mjs` fails unless this inventory exactly matches the filesystem and no production source outside `site/src` imports a listed path.

<!-- solid-deletion-manifest:start -->

site/src/app.css
site/src/app.tsx
site/src/components/Benchmarks.tsx
site/src/components/Footer.tsx
site/src/components/Header.tsx
site/src/components/Hero.tsx
site/src/components/Installation.tsx
site/src/components/MarketingOfferDialog.tsx
site/src/components/Pricing.tsx
site/src/components/UpgradeModal.tsx
site/src/components/dashboard/AdminDashboard.tsx
site/src/components/dashboard/admin/AuditLogTab.tsx
site/src/components/dashboard/admin/CohortAnalysis.tsx
site/src/components/dashboard/admin/CustomerDetailDrawer.tsx
site/src/components/dashboard/admin/DocsAnalytics.tsx
site/src/components/dashboard/admin/NotesSection.tsx
site/src/components/dashboard/admin/RevenueTab.tsx
site/src/components/dashboard/admin/TagsSection.tsx
site/src/components/dashboard/admin/analytics/CohortRetentionHeatmap.tsx
site/src/components/dashboard/admin/analytics/GeoDistribution.tsx
site/src/components/dashboard/admin/insights/CommandHeatmap.tsx
site/src/components/dashboard/admin/insights/EngagementMetrics.tsx
site/src/components/dashboard/admin/insights/FeatureAdoptionChart.tsx
site/src/components/dashboard/admin/insights/InsightsTab.tsx
site/src/components/dashboard/admin/insights/RuntimeAdoptionChart.tsx
site/src/components/dashboard/admin/insights/TimeToValueMetrics.tsx
site/src/components/dashboard/admin/shared/ErrorCard.tsx
site/src/components/dashboard/admin/shared/TabErrorBoundary.tsx
site/src/components/dashboard/admin/tabs/AnalyticsTab.tsx
site/src/components/dashboard/admin/tabs/CRMTab.tsx
site/src/components/dashboard/admin/tabs/OverviewTab.tsx
site/src/components/dashboard/admin/tag-color.ts
site/src/components/dashboard/premium/RealTimeCommandCenter.tsx
site/src/components/dashboard/premium/index.ts
site/src/components/dashboard/premium/types.ts
site/src/components/landing/FeatureGrid.tsx
site/src/components/landing/LicenseSuccessModal.tsx
site/src/components/ui/BrandIcons.tsx
site/src/components/ui/Icons.tsx
site/src/components/ui/Skeleton.tsx
site/src/design-system/DESIGN_SYSTEM.md
site/src/design-system/tokens.css
site/src/entry-client.tsx
site/src/entry-server.tsx
site/src/lib/admin.ts
site/src/lib/analytics-client.ts
site/src/lib/api-error.ts
site/src/lib/api-hooks.ts
site/src/lib/api.ts
site/src/lib/auth-client.ts
site/src/lib/auth.ts
site/src/lib/better-auth-sign-out.test.ts
site/src/lib/better-auth-sign-out.ts
site/src/lib/browser-storage.test.ts
site/src/lib/browser-storage.ts
site/src/lib/contracts/account-dashboard.ts
site/src/lib/contracts/d1-rows.test.ts
site/src/lib/contracts/d1-rows.ts
site/src/lib/contracts/dashboard-store.test.ts
site/src/lib/contracts/dashboard-store.ts
site/src/lib/contracts/dashboard.test.ts
site/src/lib/contracts/licensing-dashboard.test.ts
site/src/lib/contracts/licensing-dashboard.ts
site/src/lib/contracts/licensing-routes.test.ts
site/src/lib/contracts/login-credentials.test.ts
site/src/lib/contracts/telemetry-dashboard.test.ts
site/src/lib/contracts/telemetry-dashboard.ts
site/src/lib/contracts/tier.test.ts
site/src/lib/contracts/tier.ts
site/src/lib/contracts/worker-http.test.ts
site/src/lib/contracts/worker-http.ts
site/src/lib/dashboard-contract.test.ts
site/src/lib/dashboard-contract.ts
site/src/lib/dashboard-page.ts
site/src/lib/error-message.ts
site/src/lib/licensing-bff.test.ts
site/src/lib/licensing-bff.ts
site/src/lib/lookup.test.ts
site/src/lib/lookup.ts
site/src/lib/mailto.ts
site/src/lib/observability.ts
site/src/lib/performance-entry.test.ts
site/src/lib/performance-entry.ts
site/src/lib/prelude.ts
site/src/lib/query.test.ts
site/src/lib/query.ts
site/src/lib/segment-condition.test.ts
site/src/lib/segment-condition.ts
site/src/lib/state/dashboard-view.ts
site/src/lib/stores/dashboardStore.ts
site/src/lib/worker-api.test.ts
site/src/lib/worker-api.ts
site/src/middleware.test.ts
site/src/middleware.ts
site/src/pages/DashboardPage.tsx
site/src/routes/[...404].tsx
site/src/routes/admin.tsx
site/src/routes/api/auth/[...auth].ts
site/src/routes/api/dashboard.ts
site/src/routes/api/licensing/[...path].ts
site/src/routes/api/offer.ts
site/src/routes/dashboard.tsx
site/src/routes/docs.tsx
site/src/routes/index.tsx
site/src/routes/login.tsx
site/src/routes/privacy.tsx
site/src/routes/robots.txt.ts
site/src/routes/signup.tsx
site/src/routes/sitemap.xml.ts
site/src/routes/terms.tsx
site/src/types/cloudflare.d.ts
site/src/types/index.ts
site/src/types/ui/filters.ts
<!-- solid-deletion-manifest:end -->
