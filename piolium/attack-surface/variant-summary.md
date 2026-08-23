# Variant Summary — Stage 12 (P12, deep mode)

> Variant hunt over the 16 surviving P10 findings against commit `6eb3c8e` (main).
> Method: root-cause extraction from each finding → generalized structural patterns →
> ripgrep/AST-shaped sweeps across `site/workers/src`, `site/src`, `site/shared`,
> `workers/router`, `workers/releases`, contracts and migrations. Cross-checked against
> `codeql-artifacts/{entry-points,sinks}.json` entry/sink inventory. No
> `chamber-workspace/*/variant-candidates/` pre-identified candidates existed; no prior
> attack-pattern-registry.json existed (created this stage).

## Confirmed variants (4) — written to `piolium/findings-draft/p12-00{1..4}-*.md`

| ID | Origin finding | Pattern | Location | Severity |
|---|---|---|---|---|
| p12-001 | p10-004 expiry canonicalization | ISO `.toISOString()` write vs `datetime('now')` TEXT compare | `site-session.ts:157` → `:131` (internal site-session mint path; distinct file/flow from the original's auth.ts/api.ts instances) | MEDIUM |
| p12-002 | p10-011 find-or-create duplicate race | SELECT-then-INSERT without transaction + no UNIQUE on `customers.email` | `billing.ts:610-643` `customer.created` INSERT branch — a 4th instance not enumerated by the original (original listed auth.ts / site-session.ts / stripe-reconciliation.ts only) | MEDIUM |
| p12-003 | p14/p10-014 ingest missing caps | count-cap-only ingest: no Content-Length gate, no string/JSON size bounds, fail-open limiter | `docs-analytics.ts:42-66,100` + `site-analytics.ts:256-278` + uncapped schemas `http-bodies.ts:79-106` | MEDIUM |
| p12-004 | p10-016 retention promises not implemented | complete purge function exists but has zero call sites; cron wires docs cleanup only | `site-analytics.ts:662-677` (`cleanupOldAnalytics`) vs `worker.ts:340-350` | MEDIUM |

## Investigated and rejected (below Medium threshold)

- **cleanupDocsAnalytics early-delete** (`docs-analytics.ts:485-491`): ISO cutoff string compared
  against `CURRENT_TIMESTAMP` TEXT — same canonicalization family as p12-001 but the direction is
  over-deletion of analytics rows (~24 h early). Integrity-only, LOW.
- **`analytics_salts` get-or-create race** (`site-analytics.ts:60-70`): concurrent salt creation can
  briefly fork visitor hashing; self-healing, cosmetic. LOW.
- **`validate-license` machine list** (`license.ts:382`): returns revoked machines in response body,
  but includes `is_active` flag — informational only; no resurrection semantics beyond p10-012 itself.
- **Telemetry policy gating**: `resolveTelemetryIngestion` correctly filters `l.status = 'active'`
  (`telemetry-policy.ts:47`) — no missing-state-predicate variant on report-usage/cli paths.
- **Fail-open sweep**: `resolveSigning` (license.ts:223-238) fails closed; billing `requireAdmin`
  fails closed with 503 when Stripe key unset; admin.tsx `requireAdminPage` has no dev fallback —
  p10-007's fallback exists only in `dashboard.tsx`.
- **Anonymous email-keyed lookups**: `/api/get-license` (p10-009) is the sole anonymous per-email
  data-returning route; verify-session oracle already adjudicated Low in P4.
- **Stripe invoice.paid/payment_failed body-trust**: keyed by `invoice.customer` → local
  stripe_customer_id lookup; attacker influence routes exclusively through the already-reported
  p10-008 autolink chain — no new root cause.
- **Latent workers** (`router`, `releases`): fixed-origin fetches / flat R2 key reads; previously
  adjudicated Low/env, undeployed.

## Registry

Patterns and confirmed instances recorded in `piolium/attack-pattern-registry.json` (created this
stage; originals + variants under each pattern's `confirmed_instances`).
