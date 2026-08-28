# Svelte production cutover and Solid removal

**Status:** approved implementation plan; M1 in progress

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

| Capability                           | Svelte shadow                                                              | Gate before production                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Home, docs, privacy, terms, metadata | Implemented and characterized                                              | Home cannot move while it truthfully states checkout is disconnected                     |
| Login/signup and Better Auth         | Implemented with isolated secret and GitHub app                            | Production callback inputs plus coordinated logout/cookie gate                           |
| Account dashboard                    | Retained-D1 identity plus private licensing, usage, and machine projection | Auth cutover and authenticated production verification                                   |
| Admin command center/customers       | Implemented with server authorization and bounded mutations                | Required operations scope, action-result tests, authenticated verification               |
| Offer and Stripe checkout            | Worker APIs exist; Svelte UI/actions absent                                | Must be migrated because checkout preservation was selected                              |
| Solid BFF routes                     | Auth, dashboard, licensing proxy, and offer remain                         | Replace required behavior with Svelte server loads/actions; delete obsolete browser BFFs |
| Static assets/installers/public key  | Split between both trees                                                   | Copy only assets Svelte must own; keep installer/public-key behavior exact               |

The Svelte homepage currently labels paid checkout as unavailable. That is a truthful shadow state, not production parity.

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
- [ ] Authenticated Checkout creation and trusted redirect.
- [ ] Bounded post-checkout fulfillment status with no license key or provider identifier in page data/DOM.
- [ ] Shadow deployment, no-op plan, and user-controlled characterization.

Do not attach production routes during M1. The slice is complete only after automated verification, shadow deployment/no-op plan, and user-controlled authenticated checkout characterization when credentials are available.
