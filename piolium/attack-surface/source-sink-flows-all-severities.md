# Source–Sink Flows — All Severities

Stage 04 (P4) static analysis & triage. Generated from: CodeQL `security-and-quality` suite (db: `piolium/codeql-artifacts/db`, 251 JS/TS files), Semgrep OSS (baseline `p/security-audit + p/secrets + p/owasp-top-ten`; language/framework `p/typescript + p/xss + p/jwt`; custom domain rules `piolium/semgrep-rules/custom-domain.yaml`), and manual grep+read tracing of every high-score candidate file. Full slice metadata: `piolium/codeql-artifacts/call-graph-slices.json`.

## Scanner yield

| Pass | Rules | Files | Findings |
|---|---|---|---|
| CodeQL js security-and-quality suite | 201 | 251 | 2 (both Low/correctness) |
| Semgrep baseline (security-audit, secrets, owasp-top-ten) | 155 | 298 | 0 |
| Semgrep language/framework (typescript, xss, jwt) | 142 | 298 | 0 |
| Semgrep custom domain rules | 10 | 298 | 29 (structural candidates; triaged below) |

Semgrep Pro was unavailable (no `SEMGREP_APP_TOKEN`; `semgrep-core-proprietary` requires login) — **documented fallback to OSS**, so cross-file taint coverage is reduced; compensated by manual source→sink tracing.

## Attacker-controlled sources

1. All JSON bodies at the Worker route table (`site/workers/src/worker.ts`) — OTP email/code, license key/machine_id/user_name/user_email, telemetry event batches, Stripe webhook raw body (signed), docs/site analytics batches (unauthenticated).
2. Request headers read for control decisions: `X-Admin-Secret` (admin API gate), `Authorization: Bearer` (session auth), `stripe-signature` (webhook authenticity), `Origin` (CORS + BFF same-origin check), `CF-Connecting-IP` / `User-Agent` / `CF-IPCountry` (metadata, rate-limit keys, Turnstile remoteip).
3. URL components: query strings on `/api/github-stats` (cache key), licensing BFF path/search forwarding.
4. Browser-side sources enumerated by CodeQL: `window.location`, `document.referrer`, `event.data` (postMessage in `useRealtimeData.ts:173`) — client-only impact.

## Sinks (enumerated via custom CodeQL query, 567 call sites)

D1 `prepare` (377) / `batch` (9); outbound `fetch` (89, incl. siteverify, api.stripe.com, api.github.com, fixed-origin proxies); Cache API `match`/`put` (22); crypto `sign` (6: JWT HMAC/Ed25519, OTP HMAC, webhook HMAC); email `send` binding (1); `Response.redirect` (1).

## Verified source-to-sink paths (all severities)

### SLICE-OTP-SEND / SLICE-OTP-VERIFY (`handlers/auth.ts`) — Medium
body{email,code} → schema decode → HMAC(JWT_SECRET) digest → atomic D1 claim UPDATE (attempt_count<5, expiry) → session INSERT (token=generateToken(), ip=CF-Connecting-IP). Uniform 401s (no enumeration). **Issues:** Turnstile verification silently skipped when secret unset (p4-001); OTP digest keyed with dual-purpose JWT_SECRET (p4-003).

### SLICE-LICENSE-JWT (`handlers/license.ts`) — Medium
body{license_key,machine_id,...} → D1 lookup → count-then-insert seat registration → resolveSigning(JWT_PRIVATE_KEY ‖ JWT_SECRET) → HS256/EdDSA JWT {tier, features, mid, lic}. **Issues:** seat limit TOCTOU race (p4-004); key separation (p4-003). SQL fully parameterized throughout.

### SLICE-STRIPE-WEBHOOK (`handlers/billing.ts`) — Medium
raw body + signature header → constant-time HMAC verify + 300s replay window → inbox state machine → typed handlers. Signature gate precedes all parsing (verified; no unverified JSON.parse path). **Issue:** `customer.created` auto-links a local customer row to a Stripe customer by bare email match where `stripe_customer_id IS NULL` (p4-002).

### SLICE-TELEMETRY (`handlers/license.ts`, `handlers/telemetry.ts`, `handlers/{site,docs}-analytics.ts`) — Low
body{events[]} → license-gated policy → caps (50 events docs / batch caps elsewhere) → parameterized D1 inserts. Second-order render surface checked: no `innerHTML`/`@html` in `site/src/**` (Solid escapes). **Issue:** usage_daily counters are client-supplied and MAX-merged — inflation by design (p4-006 draft, integrity only).

### SLICE-BFF-LICENSING (`site/src/routes/api/licensing/[...path].ts`, `lib/licensing-bff.ts`) — Medium
Better Auth session → server-side D1 role lookup → route allowlist → same-origin (non-GET) → 1 MiB body cap → service-binding POST carrying `X-Admin-Secret: ADMIN_API_SECRET` → minted worker session returned as `Authorization: Bearer`. Response sanitized (Set-Cookie/ACAO stripped). **Issue:** single shared ADMIN_API_SECRET guards admin-role session minting across both workers (p4-005).

### SLICE-GITHUB-CACHE (`handlers/github-proxy.ts`) — Low
request.url (+ arbitrary query string) → cache key → caches.default match/put. CORS re-derived per request from live Origin against strict allowlist (`https://omg.latham.cloud`) — cached ACAO never replayed (good). Unbounded keyspace permits minor cache flooding (Low, dropped).

### SLICE-ROUTER-HEADERS (`workers/router/src/index.ts`) — Low/environment
all inbound headers → prepareOriginHeaders strips hop-by-hop + Host, sets fixed-host headers, forwards everything else (incl. client-supplied `X-Forwarded-*`, `cf-*`) → fixed-origin fetches; `rewriteUrl` constrains docs redirects to the docs host (foreign Locations pass through unchanged — trusted-origin dependency). Router not deployed per P3 recon (environment classification).

## Hidden-control-channel inventory (Phase 3 priority)

| Channel | Where consumed | Effect | Verdict |
|---|---|---|---|
| `X-Admin-Secret` | `admin-secret.ts` requireAdminSecret; `site-session.ts`; BFF mintWorkerSession | Gates `/api/internal/site-session` incl. admin-role assignment | Timing-safe (`crypto.subtle.timingSafeEqual` w/ length padding), fail-closed on unset — **sound** |
| `ADMIN_API_SECRET` shared value | BFF worker + licensing worker | Single secret mints sessions with attacker-named role if leaked | Tracked as p4-005 |
| `CF-Connecting-IP` | Turnstile remoteip, rate-limit keys, audit/session metadata | IP-scoped controls | Set by Cloudflare edge; not trusted for authz — sound |
| `stripe-signature` | billing webhook | Event authenticity | Verified before any parse — sound |
| `Origin` | CORS allowlist, BFF same-origin, github-proxy cache overrides | Cross-origin data exposure | Strict allowlists; GET/HEAD exempt from BFF same-origin (state-safe routes only) — sound |
| Better Auth forwarded headers | `createAuth().api.getSession(request.headers)` | Session resolution | No header mutation loop found upstream of calls — sound |

## Structural extraction stats

- Entry points: 30 (see `entry-points.json`)
- Sink call sites: 567 (see `sinks.json`)
- Documented source→sink slices: 8 (see `call-graph-slices.json`)
- CodeQL DB: `piolium/codeql-artifacts/db` (javascript extractor, 251 files) — retained for Phases 5/7/8/10
