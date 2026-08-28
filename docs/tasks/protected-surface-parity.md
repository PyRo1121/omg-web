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

Progress: the URL-addressable analytics capability and bounded CSV/JSON downloads are implemented. Achievements, machines, and settings remain.

- [ ] Add URL-addressable analytics, achievements, machines, and settings capability routes.
- [ ] Preserve existing account/session/entitlement behavior through browser-safe projections.
- [ ] Add bounded personal CSV and JSON exports without embedding export bodies in page data.
- [ ] Preserve explicit empty, unavailable, and partial states.
- [ ] Add pure derivation, service, route, render, keyboard, and compact-viewport coverage.
- [ ] Record exact superseded Solid account paths and helpers.

**Blocked by:** 1.

**Verification:** focused account tests, strict Svelte/TypeScript checks, build, shadow desktop/compact characterization.

## 3. Customer support operations

- [ ] Replace unbounded admin `request.formData()` calls with the bounded form reader.
- [ ] Decode forms once at the route boundary and pass trusted domain values internally.
- [ ] Add customer health history, notes, tags, audited mutations, and admin Billing Portal access.
- [ ] Preserve confirmation, forbidden-role, rate-limit, degraded-service, and post-mutation reload behavior.
- [ ] Keep customer, Stripe, database, license, and machine identifiers out of page data/DOM.
- [ ] Add focused action-result and render tests.

**Blocked by:** 1.

**Verification:** focused customer tests, strict checks, lint, build, shadow admin characterization.

## 4. Operator analytics and revenue

- [ ] Add URL-addressable analytics, cohort, insight, and revenue routes.
- [ ] Decode each retained Worker response at its capability boundary.
- [ ] Port only grounded values; render explicit unavailable states for absent inputs.
- [ ] Preserve authorization, no-store/noindex policy, and localized degradation.
- [ ] Add pure derivation, service, route, and render tests.

**Blocked by:** 3.

**Verification:** focused operator tests, strict checks, lint, build, shadow characterization.

## 5. Audit, exports, and live operations

- [ ] Add audit filtering and pagination.
- [ ] Add bounded users, usage, and audit CSV downloads with exact authorization and headers.
- [ ] Add one same-origin authenticated firehose/realtime polling boundary.
- [ ] Enforce response bounds, minimum interval, hidden-page pause, failure cutoff, and cleanup.
- [ ] Add endpoint, polling-policy, export, accessibility, and degraded-state tests.

**Blocked by:** 3. May run in parallel with 4.

**Verification:** focused audit/export/live tests, strict checks, lint, build, bounded shadow request characterization.

## 6. M2 parity and removal gate

- [ ] Verify every approved account and operator capability in the route matrix.
- [ ] Run strict checks, focused/full Svelte tests, lint, build, audit evidence, and source policy.
- [ ] Deploy shadow and require an all-noop follow-up Alchemy plan.
- [ ] Complete user-controlled authenticated Helium checks on desktop and compact viewports.
- [ ] Produce the exact Solid protected routes, components, stores, API helpers, and tests removable after cutover observation.
- [ ] Update migration status, topology, rollback, and remaining-risk documentation.

**Blocked by:** 2, 4, and 5.

**Verification:** complete M2 route matrix and the commands in the approved spec.
