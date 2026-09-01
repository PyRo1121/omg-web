# Protected-surface parity tickets

**Spec:** `docs/specs/protected-surface-parity.md`
**ADR:** `docs/adr/0001-server-first-protected-workspaces.md`

## 1. Billing Portal parity

- [x] Add exact request/response contracts for customer Billing Portal access.
- [x] Call `/api/billing/portal` through an authenticated private Worker session.
- [x] Bound and decode the Worker response; allow only credential-free HTTPS URLs at `https://billing.stripe.com`.
- [x] Add a named dashboard action and progressively enhanced account control.
- [x] Map anonymous, missing account, forbidden, rate-limited, malformed, and unavailable outcomes without leaking internals.
- [x] Add focused service, action, and render tests.
- [x] Deploy shadow, verify anonymous fail-closed behavior and a no-op follow-up plan.
- [x] Complete user-controlled authenticated Portal characterization.

Authenticated shadow characterization confirmed the expected classified `404` state for an account without a linked Stripe customer. No subscription was created solely for testing; successful external redirect behavior remains covered by the focused service and action tests until a naturally linked account exists.

**Blocked by:** none.

**Verification:**

```bash
npm --prefix site-svelte run check
cd site-svelte && npm exec -- vitest run <billing portal focused tests>
npm run lint
npm --prefix site-svelte run build
cd site-svelte && npm run plan -- --stage shadow
```

## 2. Account workspace parity

Progress: analytics, bounded CSV/JSON downloads, achievements, machines, and settings are authenticated-shadow verified at desktop and compact widths.

- [x] Add URL-addressable analytics, achievements, machines, and settings capability routes.
- [x] Preserve existing account/session/entitlement behavior through browser-safe projections.
- [x] Add bounded personal CSV and JSON exports without embedding export bodies in page data.
- [x] Preserve explicit empty, unavailable, and partial states.
- [x] Add pure derivation, service, route, render, keyboard, and compact-viewport coverage.
- [x] Record exact superseded Solid account paths and helpers.

Superseded after the production observation gate, subject to a final caller check:

- `site/src/routes/dashboard.tsx`
- `site/src/pages/DashboardPage.tsx`
- `site/src/lib/state/dashboard-view.ts`
- `site/src/lib/dashboard-page.ts`
- `site/src/lib/contracts/account-dashboard.ts`
- `site/src/lib/contracts/telemetry-dashboard.ts`
- `site/src/routes/api/dashboard.ts`
- Account-dashboard coverage embedded in `site/src/lib/contracts/licensing-dashboard.test.ts`
- `site/src/lib/contracts/telemetry-dashboard.test.ts`
- Account-dashboard scenarios in `site/e2e/staging-auth.spec.ts`

The shared licensing BFF and Worker `/api/dashboard` route are not on this list: Svelte still consumes the Worker route privately, and the BFF cannot be removed until every remaining Solid caller is gone.

**Blocked by:** none.

**Verification:** focused account tests, strict Svelte/TypeScript checks, build, shadow desktop/compact characterization.

## 3. Customer support operations

Progress: authenticated desktop and compact checks cover browser-safe health, notes, assigned tags, the tag catalog, license operations, and delegated Billing Portal behavior. Health history remains explicitly unavailable because the retained schema stores only the current score.

- [x] Replace unbounded admin `request.formData()` calls with the bounded form reader.
- [x] Decode forms once at the route boundary and pass trusted domain values internally.
- [x] Add notes, tags, audited mutations, and admin Billing Portal access.
- [x] Render health-history unavailability explicitly; the retained schema stores one current score and M2 forbids adding history persistence.
- [x] Preserve confirmation, forbidden-role, rate-limit, degraded-service, and post-mutation reload behavior.
- [x] Keep customer, Stripe, database, license, note, tag, and machine identifiers out of page data/DOM.
- [x] Add focused boundary, service, Worker integration, and render tests.

Superseded after the production observation gate, subject to the final caller check:

- `site/src/components/dashboard/admin/CustomerDetailDrawer.tsx`
- `site/src/components/dashboard/admin/NotesSection.tsx`
- `site/src/components/dashboard/admin/TagsSection.tsx`
- Customer note, tag, and delegated Billing Portal calls in `site/src/lib/api.ts`
- Customer note and tag mutations in `site/src/lib/api-hooks.ts`

**Blocked by:** none.

**Verification:** focused customer tests, strict checks, lint, build, shadow admin characterization.

## 4. Operator analytics and revenue

- [x] Add URL-addressable analytics, cohort, insight, and revenue routes.
- [x] Decode each retained Worker response at its capability boundary.
- [x] Port only grounded values; render explicit unavailable states for absent inputs.
- [x] Preserve authorization, no-store/noindex policy, and localized degradation.
- [x] Add pure derivation, service, route, and render tests.

**Blocked by:** none.

**Verification:** focused operator tests, strict checks, lint, build, shadow characterization.

## 5. Audit, exports, and live operations

- [x] Add audit filtering and pagination.
- [x] Add bounded users, usage, and audit CSV downloads with exact authorization and headers.
- [x] Add one same-origin authenticated firehose polling boundary.
- [x] Enforce response bounds, minimum interval, hidden-page pause, failure cutoff, and cleanup.
- [x] Add endpoint, polling-policy, export, accessibility, and degraded-state tests.

**Blocked by:** none.

**Verification:** focused audit/export/live tests, strict checks, lint, build, bounded shadow request characterization.

## 6. M2 parity and removal gate

- [x] Verify every approved account and operator capability in the route matrix.
- [x] Run strict checks, focused and full Svelte tests, lint, build, audit evidence, and source policy.
- [x] Deploy shadow and require an all-noop follow-up Alchemy plan.
- [x] Complete authenticated desktop and compact checks for account and operator routes.
- [x] Produce the exact Solid protected routes, components, stores, API helpers, and tests removable after cutover observation.
- [x] Update migration status, topology, rollback, and remaining-risk documentation.

**Blocked by:** production billing account credentials, organization invitation characterization, and the whole-host cutover gate.

**Verification:** complete M2 route matrix and the commands in the approved spec.
