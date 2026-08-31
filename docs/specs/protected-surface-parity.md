# Protected-surface parity and billing self-service

**Status:** approved
**Milestone:** M2 of `docs/operations/svelte-production-cutover.md`
**Selected scope:** full functional parity with the approved sensitive-data invariant

## 1. Problem

The Svelte shadow has production-grade public, authentication, account-summary, billing-checkout, admin-overview, and customer-license slices. Production still depends on Solid for the broader account and operator workspaces.

Porting the current Solid components directly would preserve a client-heavy compatibility architecture: `DashboardPage` has 50 outgoing dependencies, `AdminDashboard` has 37, and both coordinate browser API clients, stores, query caches, and infrastructure-shaped response objects. The migration instead needs every real workflow and grounded metric while keeping Svelte components thin, minimizing private data sent to browsers, and leaving Solid removable after the atomic hostname transfer.

A confirmed immediate parity gap is billing self-service. The terms direct customers to a billing portal, and `omg-saas` owns `/api/billing/portal`, but Svelte exposes no account billing-portal action.

## 2. Goals

A signed-in customer can:

- inspect account, session, entitlement, usage, achievement, machine, and settings information currently available in Solid;
- export grounded personal usage data in the supported CSV and JSON formats;
- open Stripe Billing Portal through an authenticated, server-validated redirect;
- sign out without leaving a stale browser session.

An authorized operator can:

- inspect overview, customer, CRM, analytics, insight, revenue, and audit information currently backed by retained Worker routes;
- inspect customer health, usage, machine, note, tag, and billing state;
- perform the existing audited customer/license, note, tag, and billing-portal operations;
- download users, usage, and audit CSV exports;
- observe bounded firehose/realtime data with the same functional freshness as Solid.

After production observation, the Solid protected routes, browser API clients, query/store orchestration, and protected components can be deleted without losing a supported capability.

## 3. Non-goals

- No raw license key, Better Auth token, Worker session token, Stripe/customer/database identifier, or machine identifier enters Svelte page data or rendered DOM.
- No control is rendered when no retained Worker contract can execute it. “Full parity” preserves real behavior, not dead controls or invented values.
- No browser calls `omg-saas` directly.
- No new D1 tables, migrations, caches, queues, Durable Objects, or external packages.
- No adoption of `omg-saas`, `omg-site`, or D1 into Alchemy.
- No production route attachment during M2.
- No Stripe Tax enablement until registrations and liability jurisdictions are established.

## 4. Domain vocabulary and invariants

### Account workspace

The authenticated customer's browser-safe projection of identity, sessions, entitlement, usage, achievements, machines, export availability, and billing self-service.

### Operator workspace

The admin-authorized projection of platform overview, customers, CRM, analytics, insights, revenue, audit, exports, and bounded live activity.

### Capability

One user-observable workflow with its own authorization, input, output, failure states, and owning Worker route. Tabs and cards are presentation; they are not capabilities.

### Invariants

- Better Auth owns browser identity. `omg-saas` owns licensing, billing, telemetry, CRM, and operator data.
- Every form, URL, Service Binding response, CSV response, and live-update response is bounded and decoded once where it crosses the boundary.
- After decoding, internal functions trust domain types and do not repeat boundary validation.
- Route code maps typed capability failures to HTTP/page outcomes. Components receive only domain projections.
- Stripe webhooks remain the entitlement authority. Billing Portal changes no entitlement directly.
- CSV downloads are admin-authorized, bounded, correctly typed, and streamed or returned without first embedding their contents in page data.
- Live activity uses bounded polling with explicit pause/visibility behavior; it never creates a second public SaaS origin.
- Missing bindings, sessions, roles, client addresses, malformed payloads, or rate-limit failures fail closed.

## 5. Designs considered

### A. Route-oriented, server-first workspaces — selected

Use protected Svelte routes as capability boundaries:

```text
/dashboard/                  account overview and navigation
/dashboard/analytics/        personal usage and exports
/dashboard/achievements/     grounded achievements
/dashboard/machines/         browser-safe machine projection
/dashboard/settings/         sessions, identities, billing portal

/admin/                      operator overview
/admin/customers/            directory, detail, CRM operations
/admin/analytics/            site/product analytics and cohorts
/admin/insights/             grounded advanced metrics
/admin/revenue/              reconciled revenue/subscription metrics
/admin/audit/                audit browsing and CSV exports
```

Server loads fetch only the selected route's data. Named actions own mutations and external redirects. A same-origin, authenticated Svelte endpoint exists only for behavior that genuinely requires repeated browser polling, such as bounded firehose/realtime snapshots.

**Advantages:** data minimization, progressive enhancement, URL-addressable operator state, local failure handling, lower free-tier read amplification, thin components, and straightforward route-level tests.

**Cost:** more route files and navigation transitions than the Solid single-page tabs.

### B. One aggregate server load with client tabs — rejected

Load every account/admin capability into one page and preserve tabs locally.

This minimizes routes but maximizes D1/Worker reads, SSR payload size, coupling, and private-data exposure. One degraded capability can poison the whole workspace. It is a poor fit for the free tier and the boundary discipline standard.

### C. Recreate the Solid browser BFF and query layer — rejected

Expose Svelte JSON endpoints matching Solid and port the TanStack-style browser orchestration.

This is the fastest visual port but recreates compatibility APIs that M4 intends to delete. It keeps transport types and error handling in browsers, adds a second migration target, and delays Solid removal.

## 6. Selected module boundaries

### Route shell

Each `+page.server.ts`:

1. establishes `private, no-store` headers;
2. loads and verifies Better Auth identity;
3. invokes one capability service with typed route input;
4. maps typed failures to redirect, 400/403/429, or sanitized 503 outcomes;
5. returns a browser-safe domain projection.

Each `.svelte` component contains markup, rune-backed presentation state, and event bridges only.

### Capability services

Capability modules own:

- request and response schemas for their Worker endpoints;
- projection from decoded Worker DTOs to browser-safe domain values;
- capability-specific errors and observability labels;
- pure calculations used by views.

They do not own Better Auth cookies, generic form parsing, browser redirects, or D1 migrations.

### Private Worker adapter

The existing Service Binding/session machinery is reused. During M2 it may be moved behind an internal adapter only as a caller is migrated; no broad preliminary rewrite is allowed.

The adapter hides:

- role lookup and private site-session minting;
- `LICENSING_API` request construction;
- bounded response reading;
- transport/schema failures.

Capability modules retain endpoint paths, response schemas, and domain projections. Route modules must not import private Worker session types or generic transport helpers.

### Boundary parsing

The existing bounded URL-encoded reader is reused for all mutations. Admin customer actions must stop calling unbounded `request.formData()`. Inputs are decoded once into capability types at the route boundary; services trust those types.

Service Binding, CSV, and realtime responses remain separate network boundaries and are decoded in their adapters.

## 7. Capability allowlist

### Account

- identity and connected-provider labels;
- current and other browser sessions without tokens;
- entitlement tier/status/limits/period state without raw key;
- personal command/package/runtime/time-saved trends;
- grounded achievements derived from decoded usage;
- browser-safe machine metadata without machine IDs;
- CSV and JSON personal usage exports;
- Stripe Billing Portal for the signed-in account;
- sign-out and existing supported session controls.

### Operator

- current Svelte overview and customer/license operations;
- CRM customer detail, health history, notes, tags, and audited mutations;
- cohorts and product/site analytics;
- advanced metrics/insights only when decoded Worker values exist;
- revenue and subscription metrics from retained billing routes;
- audit-log filtering and pagination;
- users, usage, and audit CSV exports;
- bounded firehose/realtime snapshots;
- admin billing-portal access through the existing authorization behavior.

Any legacy card whose value cannot be traced to a retained route or a documented pure derivation renders an explicit unavailable state; it is never synthesized.

## 8. Billing Portal vertical slice

### Input

No browser-supplied email is accepted for customer self-service. The action uses the verified Better Auth identity.

Admin customer portal access accepts a boundary-decoded customer email only where the retained Worker contract authorizes an admin override.

### Flow

1. Bound and decode the named action request.
2. Verify Better Auth identity.
3. Mint a private `omg-saas` session through `LICENSING_API`.
4. POST to `/api/billing/portal`.
5. Bound and decode the response.
6. Accept only an HTTPS URL with origin `https://billing.stripe.com` and no credentials.
7. Issue a SvelteKit external `303` redirect with an exact origin allowlist.

### Failures

- Anonymous: `401` action result with a sign-in path.
- Forbidden admin override: `403`.
- No linked billing account: classified `404` message.
- Rate limited: `429` with retry guidance.
- Missing binding, invalid response, untrusted URL, or upstream failure: sanitized `503`.

No portal URL is retained in D1, logged, or returned as ordinary page data.

## 9. Data and persistence

No schema migration is required. Better Auth continues to own its four auth tables; `omg-saas` owns all licensing, billing, telemetry, CRM, analytics, and audit tables.

M2 performs no direct Svelte writes to SaaS-owned tables. Mutations and exports use existing retained Worker routes. Unknown or malformed response shapes fail closed; no persisted row is silently rewritten.

## 10. Security and operational behavior

- All protected routes are `noindex, nofollow`, `private, no-store`, and covered by the existing CSP/security-header hook.
- Authorization is performed server-side before Service Binding access.
- Mutation forms use bounded bodies and exact schemas.
- Export filenames and content types are server-owned; user values never become arbitrary response headers.
- Polling pauses when the page is hidden, has a bounded minimum interval, and stops after repeated failures.
- Capability failures emit sanitized structured tags without request bodies, emails, URLs, keys, or identifiers.
- No production hostname, Custom Domain, or Worker Route changes occur in M2.

## 11. Smallest delivery sequence

1. **Billing self-service:** customer Billing Portal action, exact redirect allowlist, dashboard control, focused tests, shadow anonymous/live characterization.
2. **Account parity:** route-oriented analytics, achievements, machines, settings/session controls, and bounded personal exports.
3. **Customer operations:** bounded admin forms plus customer health, notes, tags, and admin portal access.
4. **Operator analysis:** analytics, cohorts, insights, and revenue routes with explicit unavailable states.
5. **Audit and live operations:** audit filtering/exports plus bounded realtime/firehose polling.
6. **Parity gate:** automated route matrix, user-controlled authenticated shadow characterization, obsolete Solid-path manifest, and a no-op Alchemy plan.

Every step leaves production on Solid and the shadow deployable. No temporary proxy or fallback is introduced.

## 12. Superseded paths after hostname cutover

After the production observation gate, remove:

- `site/src/pages/DashboardPage.tsx` and its Solid-only dashboard view/store/helpers;
- `site/src/components/dashboard/**` and active admin tab components;
- Solid protected routes `site/src/routes/dashboard.tsx` and `site/src/routes/admin.tsx`;
- browser-only admin/dashboard API hooks and BFF helpers with no external caller;
- superseded Solid billing-portal and export helpers;
- obsolete protected-surface tests after equivalent Svelte behavior tests pass.

Retain `shared/**`, `workers/api/**`, canonical migrations, external CLI service routes, and any HTTP endpoint with a verified non-Svelte caller.

## 13. Test seams and verification

### Pure/domain tests

- metric, achievement, trend, health, and presentation derivations use typed fixtures;
- unavailable input never becomes a fabricated value;
- sensitive fields cannot be constructed in browser-safe projection types.

### Capability-service tests

- exact private request method/path/body/authentication;
- bounded response success, oversize, malformed, 400/403/404/429/5xx, and binding failure;
- response projection excludes raw keys and identifiers;
- Billing Portal rejects non-Stripe origins and credentials.

### Route/action tests

- anonymous redirect/failure, forbidden role, valid mutation, confirmation failure, rate limit, degraded service, and post-mutation reload failure;
- all form streams are bounded before decoding or identity-dependent mutation work;
- CSV responses have exact content type, disposition, bounds, and authorization;
- realtime polling endpoint has authorization, bounds, interval policy, and failure cutoff.

### Component/render tests

- every route has empty, partial/unavailable, and populated states;
- keyboard navigation, labels, tables, dialogs, focus restoration, reduced motion, and compact viewports;
- SSR/page data contain no prohibited fields.

### Commands

```bash
npm --prefix site-svelte run check
cd site-svelte && npm exec -- vitest run <focused files>
npm run lint
npm run check:audit-evidence
npm --prefix site-svelte run build
cd site-svelte && npm run plan -- --stage shadow
```

UI completion additionally requires user-controlled authenticated Helium checks on desktop and compact viewports. Live Stripe Portal and admin-export checks use only designated controlled accounts and never print identifiers or credentials.

## 14. Risks and open approval

- Full functional parity is substantially larger than the current Svelte protected surface; route-oriented delivery controls blast radius but does not reduce scope.
- Some Solid metrics may prove ungrounded when traced to Worker responses. The invariant requires an unavailable state rather than invented parity.
- Live polling can consume the Workers free-tier request budget; interval and visibility behavior are release gates.
- CSV exports can contain customer information and require explicit administrator authorization and bounded responses.
- The route-oriented design changes tab navigation into URL-addressable page navigation. This is the recommended long-term interface but requires approval before tickets are published.
