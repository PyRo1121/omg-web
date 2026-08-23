# Unauthenticated Attack Surface

Reachable by an anonymous attacker — no valid session, token, or API key.

**Supersedes** the Phase 3 best-effort version: this list is derived exhaustively from the Stage 05
route-matrix audit (`public-routes-authz-matrix.md`) over every dispatch case in `worker.ts`, the
SolidStart route tree, and latent workers. Commit `6eb3c8e`.

**Coverage**: 17 entry points | 15 by-design public | 2 missing-guard / middleware-gap (p5-003, p5-001)
**Auth model**: dual identity — (a) Better Auth cookie sessions on omg-site (`createAuth().api.getSession`,
`site/src/lib/auth.ts`; admin = `user.role==='admin'` re-read from D1 in `site/src/lib/admin.ts:35`);
(b) opaque Worker bearer tokens validated against shared-D1 `sessions` (`validateSession`,
`site/workers/src/api.ts:273`); license keys act as bearer credentials on CLI routes
(`resolveTelemetryIngestion`). Admin = `customers.admin=1` checked per-handler; internal route gated by
constant-time `X-Admin-Secret` compare (`admin-secret.ts:26`, fail-closed when unset). No middleware layer
exists on either worker — every guard is inside the handler body except 4 router-level
`forbiddenUnlessAdminSession` cases in `worker.ts`.
**Coverage gaps**: compiled SolidStart `'use server'` functions (hidden nitro RPC endpoints, enumerated
best-effort from source markers); `workers/router` + `workers/releases` undeployed latent surface;
out-of-repo Rust CLI consumes minted JWTs (half the licensing protocol unauditable here).

## Pre-Auth HTTP / API Routes

| # | Method | Path | Handler (file:line) | Why pre-auth | Notable inputs / sinks | Blast radius |
|---|--------|------|---------------------|--------------|------------------------|--------------|
| 1 | GET | /health | worker.ts (inline) | by-design | – | none |
| 2 | POST | /api/auth/send-code | handlers/auth.ts:530 | by-design (**no IP limiter exists** — AUTH_RATE_LIMITER declared, never invoked; Turnstile fail-open → **p5-002**, sibling of p4-001) | email, turnstileToken? → OTP email relay, D1 auth_codes | email bombing/enumeration across unlimited victim emails; mail-reputation abuse |
| 3 | POST | /api/auth/verify-code | handlers/auth.ts:544 | by-design (brute force bounded per code: 5 attempts; **no IP bound** → p5-002) | email+code → atomic claim, customer auto-create, session mint | account binding / pre-account-hijack analog (KB scenario 2) |
| 4 | POST | /api/auth/verify-session | handlers/auth.ts:556 | by-design (token-validity oracle; unthrottled → covered by p5-002; token knowledge ≡ ownership per P4 disposition) | token in JSON body → user info for valid tokens | session-token harvesting aid |
| 5 | POST | /api/auth/logout | handlers/auth.ts:586 | by-design (registry declares 'session', handler accepts optional token — drift logged in p5-004) | optional token → DELETE session | low (requires token knowledge) |
| 6 | GET | /api/validate-license | handlers/license.ts:442 | by-design (CLI contract; license key = bearer credential) | key, machine_id? → seat accounting skipped when absent (p4-004), HS256/EdDSA JWT mint w/ dual-use JWT_SECRET (p4-003) | license-key oracle; entitlement JWT issuance |
| 7 | POST | /api/validate-license | handlers/license.ts:442 | by-design (same, JSON body) | same | same |
| 8 | GET | /api/get-license | handlers/license.ts:512–560 | **missing-guard** → **p5-003** | arbitrary victim `email` query param → tier/status/expiry/machine-count/masked key | tenant enumeration + org profiling for any email list |
| 9 | POST | /api/install-ping | handlers/license.ts:769 | by-design | install_id etc → install_stats upserts | metric pollution only |
| 10 | POST | /api/analytics | handlers/license.ts:988 | by-design (LICKEY-optional: events without `license_key` pass anonymously, license.ts:901–903; poisoning dropped Low at P4) | event batch, raw `properties` persisted verbatim → analytics_events | stored-XSS staging into admin firehose/dashboard renderers; D1 write quota exhaustion |
| 11 | POST | /api/docs/analytics | handlers/docs-analytics.ts:44 | by-design (IP rate limit only, fail-open if API_RATE_LIMITER unset) | batch → docs_* tables | poisoning; D1 quota |
| 12 | POST | /api/site/analytics/track | handlers/site-analytics.ts:254 | by-design (IP rate limit only, fail-open; UA/IP HMAC visitor id) | batch → site_* tables | poisoning; quota |
| 13 | GET | /api/github-stats | handlers/github-proxy.ts | by-design | none upstream-controlled (fixed origin; cache keyed per full URL — flooding dropped Low at P4) | low |
| 14 | GET | /api/badge/installs | worker.ts:20 | by-design | – | none (cached 60s) |
| 15 | POST | /api/internal/site-session | handlers/site-session.ts (mintSiteSession); worker.ts dispatch | **middleware-gap** → **p5-001** (Origin-Finding p4-005): on the public custom domain; sole protection is static `X-Admin-Secret`; body `role:'admin'` writes `customers.admin=1` and mints a live session | X-Admin-Secret header, {email,name,betterAuthUserId,role} → customer find-or-create + role sync + session insert | with secret: full admin API incl. PII CSV exports; without: 401 (fail-closed) |
| 16 | GET | / , /login , /signup , robots.txt , sitemap.xml ; static assets (ASSETS binding; also exposed via workers_dev=true subdomain) | site/src/routes/* | by-design SSR/marketing | – | reflected-input review deferred to P6/P7 content phases |
| 17 | * | /api/auth/[...auth] (Better Auth catch-all) | site/src/routes/api/auth/[...auth].ts:33 | by-design (sign-in/up, OAuth callbacks github/google, sign-out) | full Better Auth protocol surface; trustedOrigins=[baseUrl]; CORS hardcoded + credentials:true | ecosystem-recurrence classes (originCheck, callback state, IPv6 rate-limit keying); pin 1.7.1 unaffected per OSV at P3 |

Excluded from the table (guard establishes identity before any handler logic touches user data): the
`/api/licensing/[...path]` BFF (401 without Better Auth session, `[...path].ts:52`), `/api/report-usage`
+ `/api/cli/{event,batch}` (valid license key required), `/api/stripe/webhook` (HMAC verified before any
body-trusted write), all session/admin/billing routes (bearer + flag checks verified in matrix rows 14–67).

## Other Unauthenticated Entry Points

| Kind | Entry point (file:line) | Why pre-auth | Notes |
|------|-------------------------|--------------|-------|
| Webhook (payment) | POST /api/stripe/webhook — billing.ts:388 | by-design (signature-gated) | inbox dedupe + 5-min lease reclaim; subscription events reconcile-from-source; invoice/customer events trust signed body fields (p4-002 auto-link kept for P10) |
| Cron-triggered job | scheduled() worker.ts → cleanupDocsAnalytics, 02:00 UTC | not attacker-reachable | listed for completeness |
| Latent (not deployed) | workers/router/src/index.ts — reverse proxy forwarding client `X-Forwarded-*` after header rewrite | by-design offline | becomes a live hidden-control-channel surface if deployed (P4 dropped env/Low; deployment-gating watchlist item) |
| Latent (not deployed) | workers/releases/src/index.ts — GET /latest-version, GET /download/:filename (filename used directly as R2 object key) | by-design offline | path-traversal/object-key review required before any deploy |
| Compiled server-function RPC | nitro server-fns manifest from `'use server'` blocks (routes/dashboard.tsx:16 requireAuth; routes/admin.tsx:20 requireAdminPage → lib/admin.ts:35 D1 role check) | guarded per-function | exhaustive enumeration of generated URLs not possible from source alone; chamber spot-check recommended |

## Missing-guard / middleware-gap summary

| Row | Classification | Draft |
|-----|----------------|-------|
| #8 `/api/get-license` anonymous email-keyed disclosure | missing-guard | `p5-003-get-license-anonymous-email-enumeration.md` |
| #15 `/api/internal/site-session` public-domain reachability behind single static secret | middleware-gap | `p5-001-internal-site-session-public-reachability.md` |
| #2–4 auth plane has no functioning IP rate limiter (declared bindings never invoked) | missing-guard (config-level) | `p5-002-auth-surface-no-ip-rate-limiting.md` |
| Registry↔handler authz drift enabling future silent-public routes | inconsistent-guard | `p5-004-route-registry-authz-drift.md` |

All other pre-auth entries above are intentional public contracts (OTP auth, CLI licensing, telemetry
ingest, marketing site). Downstream phases should treat sinks reachable from rows 2–3, 8, 10–12 and the
row-15 secret gate as one severity band higher than their nominal impact.
