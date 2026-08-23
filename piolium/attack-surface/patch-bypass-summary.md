# Stage 02 — Patch History & Bypass Review

**Target:** `PyRo1121/omg-web` · **Mode:** deep · **Phase:** P2
**Generated:** 2026-08-23 · **Head commit:** `6eb3c8e` (branch `main`)
**Scan window:** `git log -n 500 --since="60 days ago"` → 226 commits reviewed; ~40 security-relevant, 15 primary fixes analyzed in depth.

All fixes below are **first-party silent fixes** (`[undisclosed]` — no GHSA/CVE exists for this repo; confirmed in Stage 01 advisory inventory).

---

## Cluster A — OTP authentication hardening `[undisclosed]`

**Commit:** `491b146` fix: harden one-time code authentication (2026-08-20)

**Pre-patch (reconstructed):** `generateOTP()` used `Math.random()` (predictable), codes stored **plaintext** in `auth_codes`, verification was `SELECT`-then-`UPDATE` (TOCTOU replay window), no attempt counter (unlimited brute force per code).

**Fix mechanism:** CSPRNG via rejection-sampled `crypto.getRandomValues`; codes persisted as domain-separated HMAC-SHA256 digests keyed by `JWT_SECRET` (`hmac-sha256:v1:` prefix, `\u0000`-joined email/code context); atomic claim via `UPDATE … WHERE id = (SELECT …) RETURNING id`; `attempt_count < 5` lockout enforced inside the claim predicate; resend atomically invalidates prior codes (`env.DB.batch`); `OtpCode` schema tightened to `/^\d{6}$/u`.

**Bypass attempts (against current HEAD):**

| Vector | Result |
|---|---|
| Alternate entry points | None — `generateOTP` removed; only `sendVerificationCode`/`verifyCode` touch `auth_codes`. |
| Replay/race | Claim is a single atomic `UPDATE…RETURNING`; second use finds `used = 0` predicate false. |
| Brute force | 5 attempts per code × 6-digit space (1e6); resend rate limit `COUNT(*) >= 3` per email per 10 min caps throughput at ~15 guesses/10 min. Not bypassable. |
| Digest bypass | Lookup is by digest only; plaintext never stored. Domain separation prevents cross-tenant digest reuse. |
| Default-state gap | `TURNSTILE_SECRET_KEY` unset ⇒ Turnstile skipped (`auth.ts:189`) — **fail-open spam gate**, but send-code email rate limit still bounds abuse. Residual, low. |
| Rate-limit scoping | Send-code limit is **per-email only**, no per-IP throttle → bounded inbox flooding (3 mails/10 min/victim). Residual, low. |

**Verdict: sound** (residual low-severity gaps noted above, none restore the original bug).

---

## Cluster B — Admin authorization (site + worker) `[undisclosed]`

**Commits:** `0d9a212` enforce server-side admin route authorization · `4bf225e` restore admin route authorization streaming · `bedb5f1` restore authenticated admin and analytics paths (2026-08-21)

**Pre-patch:** `/admin` was client-guarded only (`useSession()`); worker admin endpoints relied on… (fixed in same window to DB-checked `customers.admin`).

**Fix mechanism:** `requireAdmin()` (`site/src/lib/admin.ts`) validates Better Auth session server-side, then re-reads `role` from D1 (`UserRoleRowSchema`, fail-closed on malformed rows). Worker side: every `handleAdmin*` in `handlers/admin.ts` is wrapped in `withAdminContext`/`withAdminQuery` → `validateAdmin()` (Bearer session + `customers.admin = 1`, unauthorized attempts audit-logged with path). `/api/internal/site-session` requires `X-Admin-Secret` via `requireAdminSecret` (timing-safe compare, **fails closed when unset**). Site-session `role` is derived from the Better Auth DB role inside the BFF (`licensing-bff.ts`), never from client input.

**Bypass attempts:**

| Vector | Result |
|---|---|
| Unguarded admin handlers | Audited all 25 `handleAdmin*` exports — all wrapped except `handleAdminHealth` (returns static `{status:'ok'}`, no data). `/api/docs/analytics/dashboard`, `/api/site/analytics/{geo,realtime,overview}`, `/api/admin/stripe/*` gated in `worker.ts` via `forbiddenUnlessAdminSession`. |
| Streaming bypass (`deferStream`) | `admin.tsx:115` defers authz so the shell streams first. Only nav chrome/loading screen leaks; `AdminDashboard` is `clientOnly` and fetches data post-authz; thrown `redirect()` in deferred query is honored by SolidStart. Fail-closed for data. |
| `query()` cache poisoning | `query(requireAdminPage, 'admin-page-authorization')` is client-cached, but sign-out performs `window.location.href` full reload → cache cleared. |
| Secret default-state | `ADMIN_API_SECRET` unset ⇒ `requireAdminSecret` fails closed. Sound. |
| Role source | Role always re-read from D1 per request — no client-supplied role reaches the check. |

**Verdict: sound.**

---

## Cluster C — Privacy operations authentication & tenant scoping `[undisclosed]`

**Commit:** `0f15d48` authenticate and tenant-scope privacy operations (2026-08-20)

**Pre-patch:** `POST /api/privacy/delete` accepted caller-supplied `email` / `license_key` / `machine_id` **unauthenticated** → anyone could delete/export arbitrary customers' data (broken access control / unauthenticated data destruction).

**Fix mechanism:** `authenticatePrivacyRequest()` (Bearer session → `validateSession`); deletion subject derived exclusively from session principal (`customerId`, `email`); all 9 deletion statements scoped by `customer_id`/email subselects; export (`handleExportMyData`) and opt-out (`handleOptOut`) share the same guard. Telemetry ingestion honors opt-out via `resolveTelemetryIngestion` (join `licenses`→`customers.telemetry_opt_out`, fail-closed on malformed rows) wired into `handlers/telemetry.ts` and `handlers/license.ts` (`1d24ce3`).

**Bypass attempts:** No caller-controlled identifier remains in any privacy SQL bind; no alternate unauthenticated path to `customers.telemetry_opt_out` or deletion statements found. `handlePrivacyStatus` is static metadata only.

**Verdict: sound.**

---

## Cluster D — Billing / Stripe `[undisclosed]`

**Commits:** `0356ef0` authorize checkout through server-owned offers · `acfe220` pass validated Stripe URLs directly · `f13980e` tolerate null currency · `2e60fc9` deduplicate Stripe webhooks with durable inbox (2026-08-20/22)

**Pre-patch:** `handleCreateCheckout` accepted client-supplied `priceId` → authenticated users could mint checkout sessions for **arbitrary Stripe prices** (price manipulation).

**Fix mechanism:** Body reduced to `offer: 'pro' | 'team'` literal; price resolved from server-owned `STRIPE_{PRO,TEAM}_PRICE_ID` env (`resolveBillingPrice`, 503 fail-closed when unset); entitlement map (`maxSeats`) derived from the offer, not the client. Webhooks: HMAC-SHA256 signature with 5-min timestamp window and constant-time compare, fail-closed without secret; durable `stripe_events` inbox with atomic claim (`status/lease` predicate + 5-min stale reclaim) prevents double-processing.

**Bypass attempts:** No path from request body to Stripe `price` parameter remains; `fetchStripeJson` decodes responses through Effect Schema (fail-closed). Webhook replay blocked by inbox state machine; signature bypass not found (length check + XOR compare, no early exit on content).

**Verdict: sound.**

---

## Cluster E — Session lifecycle `[undisclosed]`

**Commit:** `360e41f` revoke all browser sessions on sign-out (2026-08-20)

**Fix mechanism:** Browser sign-out now also revokes Worker-side sessions (`site/src/lib/browser-sign-out.ts`, `worker-api.ts`), with per-failure tagging surfaced to the UI; admin page uses the same routine.

**Bypass attempts:** Failure path is fail-visible (returns `failures` list and blocks redirect) rather than fail-silent — good. Residual: if the Worker revoke call fails, the Worker session token remains valid until expiry (inherent distributed-session limitation, not a bypass of the fix itself).

**Verdict: sound.**

---

## Cluster F — CORS / header hygiene `[undisclosed]`

**Commit:** `c4769e9` dedupe cors headers on github stats cache responses (2026-08-22)

**Pre-patch:** Cached-response headers were spread (`Object.fromEntries`) next to capitalized overrides, allowing duplicate `Access-Control-Allow-Origin` values → browsers reject the response (cache-poisoned DoS on `/api/github-stats`).

**Fix mechanism:** `withCacheOverrides` builds on `new Headers(cachedHeaders)` and `.set()`s overrides — duplicates impossible.

**Bypass attempts:** Origin allowlist in `getCorsHeaders` (`api.ts:206`) is a single hardcoded origin (`https://omg.latham.cloud`), no reflection of arbitrary origins; cache key is the request URL against a fixed upstream GitHub URL (no SSRF, no key injection). `Access-Control-Allow-Credentials: true` with a fixed origin is safe.

**Verdict: sound.**

---

## Cluster G — Boundary parsing / fail-closed wave `[undisclosed]` (robustness class)

**Commits (representative):** `4c72531`, `1b90f83`, `c1aa493`, `eedb62b`, `eb84daa`, `210ead6`, `28ac4b9`, `b89307b`, `0a34cd1`, `278fa6e`, `423a264`, `cce6057`, `c0c8715`, `0b39cf4`, `b0935a5`, `2414237` (2026-07 → 2026-08)

**What was fixed:** Systematic replacement of drizzle-typed-but-unvalidated D1 rows, localStorage JSON, and Worker HTTP responses with Effect Schema parsing; `SELECT *` removed; error fallbacks made observable; edge workers (`workers/router`, `workers/releases`) convert opaque Worker exceptions (1101) into explicit 502/4xx responses; internal error strings no longer leaked to clients.

**Bypass assessment:** These are availability/integrity hardening (fail-closed), not access-control fixes — no bypass restores a security boundary. Verified the fail-closed direction persists at HEAD (e.g., `readOptionalD1Row` → `storedDataErrorResponse()` in `admin.ts`).

**Verdict: sound (hardening class; no security regression found).**

---

## Conclusions

1. **No bypassable fixes found.** All 15 primary fixes hold against the bypass vector matrix (alternate entry points, config gates, default-state, compatibility branches, parser differentials, missing normalization, sibling paths) at current HEAD.
2. **No relocated vulnerabilities** — e.g., the OTP fix's digest scheme is enforced at both write and read; the checkout fix removes the client-controlled sink entirely rather than validating it.
3. **Residual (low, tracked for P3+ deep hunt):**
   - `TURNSTILE_SECRET_KEY` unset disables Turnstile (default-state gap, `site/workers/src/handlers/auth.ts:189`).
   - OTP send-code rate limit is per-email only — bounded inbox-flooding vector; no per-IP dimension.
   - `/api/admin/health` is unauthenticated (static payload only — informational).
   - Worker-session revocation on sign-out is best-effort across the site/worker trust boundary (fail-visible, not fail-atomic).
4. **Dependency-side fixes** (dependabot/renovate bumps: nitropack 2.13.4, vite 6.4.3, drizzle-orm 0.45.2, better-auth 1.6.x→1.7.1, tar, lodash, node-forge, etc.) were verified pinned at or above fixed versions in Stage 01; no first-party code depends on the vulnerable APIs of those advisories.
