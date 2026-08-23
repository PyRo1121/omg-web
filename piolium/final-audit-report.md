# Security Audit Report: PyRo1121/omg-web

=========================================

- **Commit audited:** `6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86` (branch `main`)
- **Audit mode:** deep (`/piolium-deep`, Phases 1–15)
- **Date:** 2026-08-23
- **Confirmed findings:** 14 (0 Critical, 3 High, 11 Medium) — all with executed PoCs against the real Worker runtime

## Executive Summary

This audit of the omg-web platform (Cloudflare Workers + D1 SaaS backend, SolidStart site, CLI licensing plane) identified **14 confirmed vulnerabilities**, every one reproduced end-to-end against the production source running in a real workerd environment with production D1 migrations. There are no Critical findings: authentication bypasses, injection, and secrets-in-source classes came back clean under both static analysis and adversarial review. However, the platform's **abuse-control layer is largely absent or decorative**: the declared IP rate limiters are never invoked by any code path (H-p10-002), Turnstile bot protection silently disables itself when its secret is unset (M-p10-001), and several unauthenticated endpoints allow unlimited writes to the single shared D1 database (H-p10-014, M-p10-015). The licensing monetization plane is undermined twice over — revoked machines resurrect themselves with fresh signed JWTs (H-p10-012) and seat limits can be raced past arbitrarily (M-p10-010) — while concurrency defects across identity provisioning (M-p10-003, M-p10-011, M-p10-013) and a Stripe webhook auto-linking flaw (M-p10-008) corrupt billing and entitlement state. A recurring root cause is **fail-open handling of missing configuration** combined with **declared-but-unwired controls**, meaning deployments that look correctly configured may silently have no abuse protection at all.

## Findings by Severity

### HIGH (3)

| ID | Title | PoC Status | Report |
|----|-------|------------|--------|
| p10-002 | Authentication surface has no functioning IP rate limiter — `AUTH_RATE_LIMITER`/`ADMIN_RATE_LIMITER` bindings never invoked | executed | [report](findings/p10-002-auth-surface-no-ip-rate-limiting/report.md) |
| p10-012 | Revoked machine resurrection — `validate-license` ignores `is_active` on the existing-machine path | executed | [report](findings/p10-012-revoked-machine-resurrection/report.md) |
| p10-014 | Unauthenticated D1 write flood via `/api/analytics` — no batch cap, payload cap, rate limit, or truncation | executed | [report](findings/p10-014-analytics-ingest-missing-caps-d1-write-flood/report.md) |

### MEDIUM (11)

| ID | Title | PoC Status | Report |
|----|-------|------------|--------|
| p10-001 | Turnstile bot protection silently disabled when `TURNSTILE_SECRET_KEY` is unset (fail-open) | executed | [report](findings/p10-001-turnstile-fail-open-unset-secret/report.md) |
| p10-003 | OTP send-code quota is check-then-insert — 3-per-10-minutes cap bypassable under concurrency (50× observed) | executed | [report](findings/p10-003-otp-send-quota-toctou/report.md) |
| p10-005 | OTP attempt burnout — unauthenticated login denial-of-service for any email | executed | [report](findings/p10-005-otp-attempt-burnout-login-dos/report.md) |
| p10-006 | Internal `/api/internal/site-session` publicly reachable behind single shared secret with attacker-controlled admin role minting *(downgraded High→Medium after cold verification)* | executed | [report](findings/p10-006-internal-site-session-public-shared-secret-admin-minting/report.md) |
| p10-007 | Hardcoded dev fallback degrades Better Auth session verification to a public constant (`dev-secret-change-me`) | executed | [report](findings/p10-007-better-auth-secret-dev-fallback/report.md) |
| p10-008 | Stripe `customer.created` webhook auto-links local accounts by bare attacker-chosen email match | executed | [report](findings/p10-008-stripe-customer-created-email-autolink/report.md) |
| p10-009 | Anonymous email-keyed `GET /api/get-license` discloses account status, tier, and machine counts | executed | [report](findings/p10-009-get-license-anonymous-email-enumeration/report.md) |
| p10-010 | License seat limit enforced with non-transactional count-then-insert (TOCTOU race, 40 activations on a 2-seat license) | executed | [report](findings/p10-010-license-seat-limit-toctou-race/report.md) |
| p10-011 | Find-or-create customer race creates duplicate identity rows (no UNIQUE constraint on `customers.email`) | executed | [report](findings/p10-011-customer-find-or-create-duplicate-race/report.md) |
| p10-013 | Stripe entitlement projection serialized per-event only — concurrent webhooks persist stale subscription snapshots | executed | [report](findings/p10-013-stripe-projection-stale-write/report.md) |
| p10-015 | Unthrottled anonymous row inflation via `/api/install-ping` poisons the public installs badge | executed | [report](findings/p10-015-install-ping-unthrottled-row-inflation/report.md) |

### CRITICAL (0)

No Critical-severity findings survived the review chamber, false-positive elimination, and cold verification pipeline.

## Technical Findings Detail

---

### [p10-002] Authentication surface has no functioning IP rate limiter — declared bindings never invoked

- **Severity:** HIGH
- **Summary:** The `wrangler.toml` comment promises "10 requests per minute per IP — brute force protection" via `AUTH_RATE_LIMITER`/`ADMIN_RATE_LIMITER` bindings, but zero handler code references either binding; the only brake on OTP issuance keys on attacker-chosen email, so nothing throttles a single source IP.
- **Impact:** Observed: one unauthenticated IP relayed **15 OTP emails in <60s** through the platform's own `EMAIL` binding (50% over the documented limit) and hammered the `/api/auth/verify-session` token oracle 12× with zero 429s across 27 auth requests. Inferred at scale: mail-reputation abuse, cross-email user enumeration, and full brute-force throughput against targeted OTPs — the auth API has effectively *no* abuse controls out of the box.
- **Root Cause:** Configuration/documentation drift — limiters provisioned and typed into `Env`, but the wiring step (`env.AUTH_RATE_LIMITER.limit({ key: ip })`) was never implemented; the per-email D1 count keys on attacker-controlled input rather than `CF-Connecting-IP`, and the fail-open default in `requireTurnstile` removes the last brake. Invisible to structural SAST because the defect is an absence of code.
- **Key Code Reference:** `site/workers/src/api.ts:25–26` (binding type declarations only); `site/workers/wrangler.toml` (limiter config); `site/workers/src/handlers/auth.ts` (per-email COUNT guard)
- **PoC Status:** executed (workerd + production D1 migrations)
- **Detailed Report:** [piolium/findings/p10-002-auth-surface-no-ip-rate-limiting/report.md](findings/p10-002-auth-surface-no-ip-rate-limiting/report.md)
- **Proof of Concept:** `poc.sh` · **Evidence:** `evidence/exploit.log`, `setup.log`, `impact.log`
- **Cold verification:** P11-LITE CONFIRMED (challenged high → high)

---

### [p10-012] Revoked machine resurrection — `validate-license` ignores `is_active`

- **Severity:** HIGH
- **Summary:** The existing-machine fast path in `registerOrTouchMachine()` looks up machines with no `is_active` predicate, so a dashboard-revoked machine transitions revoked → fully valid simply by calling `POST /api/validate-license` again, receiving a fresh signed ~7-day offline JWT while simultaneously freeing its seat.
- **Impact:** Observed: a revoked machine re-validated successfully (`tier=pro features=8`) and a second distinct machine activated concurrently on a `max_machines=1` license. Revocation is reduced to a cosmetic dashboard action — per-seat revenue can be diluted arbitrarily and abuse-driven deprovisioning cannot be enforced; offline-valid JWTs extend the window even after a fix.
- **Root Cause:** Missing `AND is_active = 1` predicate in the existing-machine lookup, combined with no downstream check of `is_active`; the sibling seat-count query applies the filter correctly (~30 lines away), creating false assurance. Additionally `revoked_at` is never written by any handler.
- **Key Code Reference:** `site/workers/src/handlers/license.ts:253–258` (`findMachine`, unfiltered) vs `license.ts:288` (seat count, filtered)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-012-revoked-machine-resurrection/report.md](findings/p10-012-revoked-machine-resurrection/report.md)
- **Proof of Concept:** `poc.sh` + `poc.test.ts` · **Evidence:** `evidence/exploit.log`, `impact.log`
- **Cold verification:** P11-LITE CONFIRMED (challenged high → high)

---

### [p10-014] Unauthenticated D1 write flood via `/api/analytics`

- **Severity:** HIGH
- **Summary:** `POST /api/analytics` accepts arbitrarily large anonymous batches with no batch-size cap, body-size gate, rate limit, or string truncation, fanning each event into up to 5 writes against the shared D1 database — unlike its three hardened sibling telemetry routes.
- **Impact:** Measured: one 120-event anonymous request produced ~605 statements in a single `env.DB.batch()` and a 2 MiB blob was stored verbatim; five rapid batches saw zero 429s. Because `omg-platform` is the single D1 database shared by both Workers on the Free plan, exhausting the daily rows-written quota fails **all** platform writes — OTP codes, sessions, licensing, Stripe projections — until UTC reset: a cheap anonymous attack converts into a full-day outage of the authentication and monetization plane.
- **Root Cause:** Missing-controls asymmetry: `AnalyticsBatchSchema.events` has no `maxItems`, strings lack `maxLength`, `decodeJsonBody` performs no size check, `ingestAnalytics` validates no batch length, no limiter call exists in the handler, and ingestion is fully anonymous. Purely an *absence* of controls on a parameterized write path — invisible to taint-style SAST.
- **Key Code Reference:** `site/workers/src/contracts/license-ops.ts` (unbounded schemas); `site/workers/src/body.ts` (`decodeJsonBody`); `site/workers/src/handlers/license.ts` (`ingestAnalytics`)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-014-analytics-ingest-missing-caps-d1-write-flood/report.md](findings/p10-014-analytics-ingest-missing-caps-d1-write-flood/report.md)
- **Proof of Concept:** `poc.sh` · **Evidence:** `evidence/exploit.log`, `impact.log`
- **Cold verification:** P11-LITE CONFIRMED (challenged high → high)

---

### [p10-001] Turnstile fail-open when `TURNSTILE_SECRET_KEY` unset

- **Severity:** MEDIUM
- **Summary:** `requireTurnstile()` returns success without any check, log, or error whenever `TURNSTILE_SECRET_KEY` is undefined or empty — a silent fail-open insecure default on the sole bot gate protecting unauthenticated OTP issuance.
- **Impact:** With the secret unset, `POST /api/auth/send-code` issues OTPs with no token input (responses byte-identical to the protected case, so drift is undetectable): enables email bombing from `noreply@latham.cloud` and friction-free scripted OTP attempts. Most at risk: staging/local deploys and production secret-loss during rotation, which persists indefinitely with no signal.
- **Root Cause:** An optional configuration value controls whether a security control runs, and absence is interpreted as "disabled" rather than misconfiguration — no environment-aware policy, loud degradation, or deploy-time validation.
- **Key Code Reference:** `site/workers/src/handlers/auth.ts:186–201` (`requireTurnstile`)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-001-turnstile-fail-open-unset-secret/report.md](findings/p10-001-turnstile-fail-open-unset-secret/report.md)
- **Proof of Concept:** `poc.test.ts` (via `poc.sh`) · **Evidence:** `evidence/exploit.log`

---

### [p10-003] OTP send-quota TOCTOU burst bypass

- **Severity:** MEDIUM
- **Summary:** The 3-per-10-minutes send-code quota is a `SELECT COUNT(*)` followed much later by an unconditional `INSERT` — separate round-trips with no transaction or conditional insert — so N concurrent requests all observe `count < 3` and all insert.
- **Impact:** Observed: 50 concurrent anonymous requests delivered 50 OTP emails to one victim address within the quota window (16.7× documented cap; sequential control correctly returned `200,200,200,429,429`). Enables sustained mailbox bombing, sender-reputation damage, and cost abuse at trivial attacker cost.
- **Root Cause:** Classic TOCTOU: admission split across a read and a later write bound together by nothing; schema offers no compensating constraint; IP-level limiter unwired; Turnstile fails open by default.
- **Key Code Reference:** `site/workers/src/handlers/auth.ts` (`sendVerificationCode`: COUNT then INSERT); `migrations/0000_current_baseline.sql` (`auth_codes`)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-003-otp-send-quota-toctou/report.md](findings/p10-003-otp-send-quota-toctou/report.md)
- **Proof of Concept:** `poc.test.ts` (via `poc.sh`) · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-005] OTP attempt burnout — unauthenticated login DoS for any email

- **Severity:** MEDIUM
- **Summary:** The verify-code failure path increments the attempt counter on the victim's single active code regardless of what the attacker submits, so 5 junk submissions burn any freshly issued code and lock the victim out of sign-in indefinitely.
- **Impact:** Observed: two full burnout cycles — victim's legitimate inbox codes rejected with 401 within seconds of issue, replacement codes burned immediately, zero 429s across 10 attacker requests. Any user whose email is known can be kept unable to complete sign-in for the duration of the attack; admins/high-value accounts on default configuration are most exposed.
- **Root Cause:** Not the atomic counter itself but its composition with the single-active-code policy on an unprotected endpoint: arbitrary attacker misses charge to the latest active code, and no IP throttle or bot gate exists around `verify-code`.
- **Key Code Reference:** `site/workers/src/handlers/auth.ts:362–374` (failure-path UPDATE); `auth.ts:254–256` (single-active-code policy)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-005-otp-attempt-burnout-login-dos/report.md](findings/p10-005-otp-attempt-burnout-login-dos/report.md)
- **Proof of Concept:** `poc.test.ts` (via `poc.sh`) · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-006] Public internal site-session endpoint with shared-secret admin minting

- **Severity:** MEDIUM *(final, after adversarial review; initially triaged High)*
- **Summary:** `POST /api/internal/site-session` is registered in the same public route table as customer-facing routes despite `transport: 'internal'` classification, guarded only by one static shared secret, and trusts the request body's `role` field to set `customers.admin = 1`.
- **Impact:** Observed: a public-form request authenticated by only `X-Admin-Secret` minted a live session whose D1 row carries `admin: 1`, returning HTTP 200 from `/api/admin/dashboard`, `/api/admin/users`, and the PII CSV export. Any holder of that one secret (leak, weak value, compromised integration) gains full administrative access to all ~26 admin routes; the persisted admin flag outlives the session. Tempered to Medium solely by the secret-possession precondition.
- **Root Cause:** The `transport: 'internal'` registry classification is documentation-only — dispatch enforces no binding-context/IP check; role elevation comes directly from caller-supplied JSON; no rate limiting or network-layer restriction.
- **Key Code Reference:** `site/workers/src/worker.ts:255–256` (public dispatch); `site/workers/src/handlers/site-session.ts:184–188` (secret check) and `:103–116` (`syncCustomerRole`)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/report.md](findings/p10-006-internal-site-session-public-shared-secret-admin-minting/report.md)
- **Proof of Concept:** `poc.sh` (+ `setup.sh`) · **Evidence:** `evidence/exploit.log`, `setup.log`, `impact.log`
- **Cold verification:** P11-LITE CONFIRMED, downgraded High → Medium (admin-equivalent-secret precondition; mechanism fully reproduced incl. HTTP 200 on admin dashboard)

---

### [p10-007] `BETTER_AUTH_SECRET` hardcoded dev fallback in dashboard guard

- **Severity:** MEDIUM
- **Summary:** `requireAuth()` falls back to `BETTER_AUTH_SECRET: cf.BETTER_AUTH_SECRET || 'dev-secret-change-me'` — a constant shipped in the public repo — so any deployment missing the binding verifies dashboard session cookies against a publicly known key.
- **Impact:** Observed: a forged cookie keyed on the public constant, computed offline from a leaked raw session token (stored unsigned in D1), rendered another user's account as authenticated on `/dashboard`; wrong-key and no-cookie controls were rejected. The degraded mode is self-sustaining — sign-up/sign-in keep working via better-auth's own fallback, so nothing visibly breaks.
- **Root Cause:** A convenience dev-fallback embedded in the production auth path converts "required secret absent" from a loud failure into a silent downgrade; secret handling is inconsistent (URL misconfiguration throws, secret absence substitutes a literal).
- **Key Code Reference:** `site/src/routes/dashboard.tsx:17–36` (`requireAuth`, fallbacks at :21–22)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-007-better-auth-secret-dev-fallback/report.md](findings/p10-007-better-auth-secret-dev-fallback/report.md)
- **Proof of Concept:** `poc.sh` (+ `setup.sh`) · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-008] Stripe `customer.created` webhook auto-links accounts by bare email

- **Severity:** MEDIUM
- **Summary:** The webhook handler matches events to local rows by the event body's `email` field and overwrites the `stripe_customer_id` of any existing unbound local row — a valid Stripe signature authenticates the sender, not the subject of the event.
- **Impact:** Observed in D1: the victim's local row was re-bound to the attacker's Stripe customer id and an invoice from the attacker's own purchase ($666.00) landed in the victim's billing records. Inferred: subsequent subscription/invoice events for the attacker project onto the victim's row (entitlement downgrade of a paid account), and pre-bind victims can be hijacked ahead of their first legitimate purchase.
- **Root Cause:** Identity assumed from unverified free-text data (the checkout-typed email) plus silent auto-linking without confirmation on either side; downstream projection queries repeat the same `WHERE stripe_customer_id = ? OR email = ?` pattern.
- **Key Code Reference:** `site/workers/src/handlers/billing.ts:600–650` (`customer.created` branch)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-008-stripe-customer-created-email-autolink/report.md](findings/p10-008-stripe-customer-created-email-autolink/report.md)
- **Proof of Concept:** `poc.py` (driver `exploit.sh`, `setup.sh`) · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-009] Anonymous `GET /api/get-license` enumeration oracle

- **Severity:** MEDIUM
- **Summary:** The intentionally-public route resolves customers purely by an arbitrary `email` query parameter and returns tier, subscription status, expiry, seat ceiling, active machine count, and masked license-key fragments — with no ownership check or rate limiting.
- **Impact:** All observed: clean registration oracle (`found:true/false` delta), revenue profiling (paying tier + active/canceled health), fleet reconnaissance before targeted phishing, and correlation of partially-leaked license keys to specific accounts. Unthrottled GET makes bulk enumeration over scraped email lists practical.
- **Root Cause:** Route made public but response data far exceeds what a public lookup needs; caller-supplied email trusted as sole resource selector; this "silent missing check" class passes SAST cleanly.
- **Key Code Reference:** `site/shared/licensing-routes.ts:59–64` (`authentication: 'none'`); `site/workers/src/handlers/license.ts:521` (`handleGetLicense` email-only join), `:541` (machine count)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-009-get-license-anonymous-email-enumeration/report.md](findings/p10-009-get-license-anonymous-email-enumeration/report.md)
- **Proof of Concept:** `poc.sh` (+ `setup.sh`) · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-010] License seat-limit count-then-insert TOCTOU race

- **Severity:** MEDIUM
- **Summary:** Machine activation enforces `max_machines` with a separate `SELECT COUNT(*)` followed by `INSERT INTO machines` — no transaction, conditional insert, or constraint covering distinct machine IDs — so concurrent activations all observe the stale count.
- **Impact:** Observed: a pro license with a paid limit of 2 machines ended up with **40 active machine rows and 40 granted signed JWTs** from one concurrent burst (sequential control held `[valid, valid, denied, denied]`). Converts directly into revenue loss (one paid seat unlocks unlimited activations) and corrupts admin CRM seat data.
- **Root Cause:** TOCTOU: policy evaluated on data read in a separate round-trip from the mutation it gates; the existing `UNIQUE(license_id, machine_id)` only rejects duplicate IDs, not racing new ones. The codebase's own atomic OTP claim pattern demonstrates the correct fix but was not applied here.
- **Key Code Reference:** `site/workers/src/handlers/license.ts:285–316` (`registerOrTouchMachine`)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-010-license-seat-limit-toctou-race/report.md](findings/p10-010-license-seat-limit-toctou-race/report.md)
- **Proof of Concept:** `poc.sh` + `poc.test.ts` · **Evidence:** `evidence/exploit.log`

---

### [p10-011] Find-or-create duplicate customer rows (no UNIQUE email)

- **Severity:** MEDIUM
- **Summary:** Three independent find-or-create paths use SELECT-then-INSERT with no transaction, and the schema has no UNIQUE constraint on `customers.email`, so two concurrent requests create two identity rows for one email.
- **Impact:** Observed: two concurrent verify-code calls produced two customer rows with divergent IDs, each carrying its own free license. Inferred: sessions, licenses, the `admin` flag, and Stripe linkage can land on different rows permanently (email-keyed lookups bind via `.first()`), breaking role-sync totality and failing Stripe-link writes mid-flow — with no merge logic anywhere in the repository.
- **Root Cause:** TOCTOU in identity provisioning with no uniqueness backstop at the schema, application, or lock level; D1 serializes statements but provides no atomicity across the multi-round-trip window.
- **Key Code Reference:** `site/workers/migrations/0000_current_baseline.sql:298–309` (`customers` table); three call sites: `handlers/auth.ts:270–303`, `handlers/site-session.ts:54–81`, `stripe-reconciliation.ts:110–131`
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-011-customer-find-or-create-duplicate-race/report.md](findings/p10-011-customer-find-or-create-duplicate-race/report.md)
- **Proof of Concept:** `exploit.sh` + `poc.test.ts` · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-013] Stripe projection stale-write (cross-event lost update)

- **Severity:** MEDIUM
- **Summary:** The webhook inbox lease serializes only retries of a single event id; distinct events touching the same customer process concurrently and their fetch-then-project snapshots commit with no version/timestamp guard, so an older worker can overwrite newer billing state.
- **Impact:** Observed: after a cancellation correctly projected, the stale worker's late batch reverted all four entitlement rows to pre-cancellation state and `validate-license` minted a valid Pro JWT for a subscription Stripe reports as canceled — demonstrated revenue loss. Symmetric interleaving locks out paying customers; admin support overrides are silently clobbered by queued webhooks; the divergence is unaudited and invisible.
- **Root Cause:** No synchronization spanning different events for the same `customer_id`, and a last-writer-wins projection write with no monotonicity guard (no compare-and-set on `current_period_end`, no provenance column).
- **Key Code Reference:** `site/workers/src/handlers/billing.ts:193–227` (`claimStripeEvent`); `site/workers/src/stripe-reconciliation.ts:213–231` (unguarded projection batch); `handlers/admin.ts:769–775` (override clobber)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-013-stripe-projection-stale-write/report.md](findings/p10-013-stripe-projection-stale-write/report.md)
- **Proof of Concept:** `poc.sh` + `poc.test.ts` · **Evidence:** `evidence/exploit.log`, `impact.log`

---

### [p10-015] Unthrottled anonymous `/api/install-ping` row inflation & badge poisoning

- **Severity:** MEDIUM
- **Summary:** The anonymous first-run telemetry endpoint inserts one durable D1 row per unique attacker-chosen `install_id` with no authentication, CAPTCHA, rate limiter, or length caps — and the raw row count is served publicly as the installs badge.
- **Impact:** Observed: 25 unauthenticated requests inflated the public badge from 1 to 27; replays ignored by `INSERT OR IGNORE` confirm uniqueness of attacker input is the sole write gate; a single request carrying ~200 KB of uncapped string fields was persisted verbatim. Scaling gives linear quota drain on the shared Free-plan D1 database and unlimited poisoning of a public marketing metric.
- **Root Cause:** Three mitigations absent at once: unused `API_RATE_LIMITER` binding on this route, no `maxLength`/format constraints in `InstallPingBodySchema`, and no sanitization between raw `install_stats` rows and the badge aggregate.
- **Key Code Reference:** `site/workers/src/handlers/license.ts:754–761` (schema), `:779–786` (insert); `worker.ts:87–121` (badge aggregate)
- **PoC Status:** executed
- **Detailed Report:** [piolium/findings/p10-015-install-ping-unthrottled-row-inflation/report.md](findings/p10-015-install-ping-unthrottled-row-inflation/report.md)
- **Proof of Concept:** `poc.sh` · **Evidence:** `evidence/exploit.log`, `impact.log`

---

## Attack Surface Summary

Full attack-surface intelligence lives in [`piolium/attack-surface/`](attack-surface/); the consolidated narrative is in [`knowledge-base-report.md`](attack-surface/knowledge-base-report.md). Key artifacts:

- **Architecture & inventory:** [`architecture-entrypoints.md`](attack-surface/architecture-entrypoints.md), [`lite-recon.md`](attack-surface/lite-recon.md), [`manual-attack-surface-inventory.md`](attack-surface/manual-attack-surface-inventory.md), SBOM ([`sbom.json`](attack-surface/sbom.json)), advisory intelligence ([`advisory-summary.md`](attack-surface/advisory-summary.md)), patch-bypass analysis ([`patch-bypass-summary.md`](attack-surface/patch-bypass-summary.md))
- **Unauthenticated & authorization surfaces:** [`unauthenticated-surface.md`](attack-surface/unauthenticated-surface.md), [`public-routes-authz-matrix.md`](attack-surface/public-routes-authz-matrix.md), [`authz-coverage-gaps.md`](attack-surface/authz-coverage-gaps.md)
- **Data-flow & taint:** DFD/CFD slices in the KB (DFD-1 anonymous OTP flow, DFD-2 pre-auth licensing, DFD-3 Stripe webhook projection, DFD-4 telemetry→dashboard chain; CFD-1 privilege transition, CFD-2 admin enforcement topology), [`cross-service-edges.md`](attack-surface/cross-service-edges.md), [`source-sink-flows-all-severities.md`](attack-surface/source-sink-flows-all-severities.md)
- **Domain-specific audits:** spec-gap analysis ([`spec-gap-summary.md`](attack-surface/spec-gap-summary.md)), state & concurrency audit ([`state-concurrency-summary.md`](attack-surface/state-concurrency-summary.md)) — the source of most confirmed findings — deep probe results ([`deep-probe-summary.md`](attack-surface/deep-probe-summary.md)), candidate triage ([`candidates-summary.md`](attack-surface/candidates-summary.md))
- **Variant analysis:** [`variant-summary.md`](attack-surface/variant-summary.md) and the pattern library [`../attack-pattern-registry.json`](../attack-pattern-registry.json) (7 abstracted root-cause patterns with detection signatures)

The dominant structural weaknesses surfaced by the attack-surface work: (1) a single shared Free-plan D1 database concentrates all write-quota DoS exposure; (2) an exact-switch dispatcher with no middleware layer means every route's guard stack must be assembled by hand, producing sibling-asymmetry gaps (p10-002, p10-014, p10-015); (3) `transport: 'internal'` classifications are documentation-only (p10-006).

## Coverage Gaps

From the KB ([Coverage Gaps](attack-surface/knowledge-base-report.md)) and audit execution:

- **Core Rust CLI out of repo** — the actual JWT/license consumer is unauditable here; half of the licensing protocol (client-side validation, key storage, offline enforcement) could not be examined.
- **`workers/releases` dependency closure unresolved** (no package.json — SBOM gap).
- **Generated/committed build surface** — `site/dist/**` bundles excluded from first-party SAST; SolidStart compiled server-function endpoints enumerated best-effort from `'use server'` markers only.
- **Schema drift risk** — migrations split across `site/workers/migrations` (canonical), `migrations-legacy/`, and `site/drizzle/migrations` with no single authority.
- **Semgrep Pro unavailable** in this environment — cross-file/interfile taint passes skipped; compensated by manual tracing of the 8 high-risk slices only.
- **CodeQL JS taint on Workers sources** requires custom source modeling (custom `.ql` files provided); full interprocedural taint graphs were not produced.
- **Production deployment not exercised** — all PoCs ran against real workerd + local D1 with production migrations/config defaults rather than a live internet-facing deploy (no deploy credentials).
- **Confirmed drafts without PoCs:** five additional chamber-validated findings were never promoted to PoC phase and are therefore *not counted* in the 14 above — see "Validated but unpromoted findings" below.

### Validated but unpromoted findings (PoC pending — not included in counts)

These drafts passed the review chamber (Verdict: VALID) and variant analysis but received no PoC build/cold-verification cycle:

| Draft | Title | Severity-Original | Origin | Note |
|-------|-------|-------------------|--------|------|
| `p10-004-otp-session-expiry-canonicalization` | OTP/session expiry never enforced intra-day (`.toISOString()` write vs `datetime('now')` TEXT compare) | MEDIUM | p7-001 | Root cause also tracked as registry pattern `timestamp-canonicalization-sqlite-text-compare` |
| `p10-016-privacy-deletion-retention-promises-not-implemented` | GDPR deletion/retention promises contradict implementation | MEDIUM | p7-004 | Also origin of variant p12-004 |
| `p12-001-site-session-mint-expiry-canonicalization` | Expiry canonicalization on internal site-session mint path (`site-session.ts:157→:131`) | MEDIUM | p10-004 | Variant of p10-004 |
| `p12-002-stripe-customer-created-insert-race` | Insert race in `customer.created` handler | HIGH | p10-011 | Variant of p10-011 family |
| `p12-003-docs-site-analytics-missing-payload-caps` | Docs analytics payload caps missing | MEDIUM | p10-014 | Variant of p10-014 family |
| `p12-004-site-analytics-retention-cleanup-dead-code` | Retention cleanup function has zero call sites (`site-analytics.ts:662–677` vs `worker.ts:340–350`) | MEDIUM | p10-016 | Variant of p10-016 |

See [`findings-draft/`](findings-draft/) for these drafts and [`attack-surface/variant-summary.md`](attack-surface/variant-summary.md) for the variant analysis rationale.

## Methodology Notes

Pipeline: advisory intelligence → architecture/SBOM inventory → knowledge base construction (threat modeling, DFD/CFD slices, domain attack research Modes A/B/C) → CodeQL structural extraction + Semgrep OSS suites + custom rules (Semgrep Pro unavailable) → multi-agent Review Chambers (Attack Ideator, Code Tracer, Devil's Advocate, Chamber Synthesizer per threat cluster) → adversarial cold verification (P11-LITE) → variant analysis (P12) → real-environment PoC construction & execution (P13) → consolidation (P14/P15).

**Chamber statistics** (from [`chamber-workspace/index.md`](chamber-workspace/index.md)):

- **6 Review Chambers** spawned, clustered by attack class: C1 auth/OTP abuse, C2 privilege/trust boundary, C3 cross-account enumeration, C4 concurrency/state-machine, C5 resource exhaustion, C6 crypto/compliance hygiene
- **21 draft hypotheses reviewed → 16 confirmed survivors** (4 duplicates merged, 4 rejected as FP with documented reasons)
- Final promoted set after PoC phase: **14 findings** (this report); 6 validated drafts remained unpromoted (see above)
- **7 attack patterns** abstracted into [`attack-pattern-registry.json`](attack-pattern-registry.json) (`fail-open-env-gate`, `declared-control-not-wired`, `count-then-insert-race`, `missing-state-predicate`, `signed-event-untrusted-field`, `missing-caps-vs-sibling-asymmetry`, `promise-vs-implementation`)
- **4 Phase-12 variants** identified (p12-001..004); 8 further candidates investigated and rejected below Medium
- **Cold verification (P11-LITE):** all 4 High-severity survivors challenged and CONFIRMED (1 downgraded High→Medium on precondition); reproduction via real `worker.fetch` in workerd against local D1 seeded with production migrations ([`real-env-evidence/p11-adversarial-vitest-run.log`](real-env-evidence/p11-adversarial-vitest-run.log))

**Static analysis:** Semgrep OSS (security-audit, secrets, owasp-top-ten, typescript, xss, jwt + 10 custom domain rules) → 29 structural candidates triaged; CodeQL JS security-and-quality suite → 2 Low/correctness findings; no Low findings promoted (per severity floor).

## Conclusion

The omg-web platform demonstrates solid fundamentals in the areas audits usually worry about most: parameterized SQL throughout, correct webhook signature gating, timing-safe secret comparison, hashed OTP storage, and an atomic claim pattern used correctly in the OTP path. No Critical findings emerged, and injection/secrets-in-source classes were clean under dual static-analysis engines and adversarial review.

However, the platform's real risk profile lies where scanners don't look. The abuse-control layer is largely aspirational: rate limiters exist as configuration prose but zero call sites, CAPTCHA gates disable themselves silently on configuration drift, and multiple anonymous endpoints write unboundedly into the single shared D1 database that carries authentication, licensing, and billing — making cheap attacks capable of a full-day platform outage. The monetization plane is independently broken by two confirmed logic flaws (revoked-machine resurrection and seat-limit races), and concurrency defects across identity and Stripe projection can permanently fragment identities and entitle cancelled accounts. The recurring meta-pattern — **controls declared but not wired, and fail-open behavior on missing secrets** — means the shipped default posture is materially weaker than the documented posture.

Remediation priority: (1) wire and enforce the declared rate limiters keyed on `CF-Connecting-IP` and make missing-secret configurations fail loudly/closed (addresses p10-001/002/007 and blunts 003/005/014/015); (2) add the `is_active = 1` predicate and atomic conditional inserts on the licensing paths (p10-012/010); (3) add a UNIQUE index on `customers.email` with dedup migration and monotonic guards on Stripe projections (p10-011/013); (4) cap and throttle the anonymous telemetry/write endpoints (p10-014/015); (5) remove email-based webhook auto-linking and body-supplied role elevation (p10-008/006). The six validated-but-unpromoted drafts (notably the expiry-canonicalization and GDPR-retention families) warrant follow-up verification in a future pass.

---

*Report generated by Stage 15 (Final Report Assembly) of the piolium deep audit pipeline. Individual finding evidence: `piolium/findings/<ID>-<slug>/evidence/`.*
