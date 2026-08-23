# Manual Attack Surface Inventory — Stage 08 (P8, Deep Probe)

> Manual probe over source at commit `6eb3c8e` (main). Complements (does not duplicate)
> `unauthenticated-surface.md` (P5 route matrix) and `source-sink-flows-all-severities.md` (P4).
> Focus: highest-impact slices selected from the KB priority scenarios — anonymous telemetry
> ingest economics, OTP lifecycle abuse, and the unauthenticated licensing plane.

## 1. Public routes / URLs (exploit-relevant subset)

| Method | URL | Handler | Auth | Notes for exploitation |
|--------|-----|---------|------|------------------------|
| POST | `https://omg-api.latham.cloud/api/auth/send-code` | `handlers/auth.ts:sendVerificationCode` (adapter `:530`) | none | email + optional turnstileToken; Turnstile fail-open (`auth.ts:186-188`); quota = per-email count ≥3/10min only (`auth.ts:239-246`) — attacker-chosen key |
| POST | `https://omg-api.latham.cloud/api/auth/verify-code` | `handlers/auth.ts:verifyCode` (adapter `:544`) | none | email+code; atomic claim (`auth.ts:337-349`); failure path burns attempts on latest active code (`auth.ts:363-374`) |
| POST | `https://omg-api.latham.cloud/api/auth/verify-session` | `handlers/auth.ts:556` | token = credential | UUIDv4-token oracle; P4 triaged Low |
| GET/POST | `/api/validate-license` | `handlers/license.ts:442` (`decodeInput`), core `validateLicense :478` | license key = bearer | machine_id-absent skips seat accounting (`registerOrTouchMachine :241-244`, p4-004) |
| GET | `/api/get-license?email=` | `handlers/license.ts:512-560` | none | p5-003; `maskKey` reveals first 4 + last 4 hex chars (`license.ts:36-40`) |
| POST | `/api/report-usage` | `handlers/license.ts:reportUsage :587` | license key | `installed_packages`/`runtime_usage_counts` are uncapped `Record<string,number>` (`contracts/license-ops.ts:23`) → per-key row growth in `analytics_packages`/`analytics_daily` |
| POST | `/api/install-ping` | `handlers/license.ts:769-792` | **none** | INSERT OR IGNORE keyed on attacker-chosen `install_id`; **no rate limiter, no max length** |
| POST | `/api/analytics` | `handlers/license.ts:ingestAnalytics :885-976` | **none when `license_key` absent** (`license.ts:905-908`) | **no Content-Length cap, no batch cap, no rate limiter, no string truncation** (contrast siblings below); each `command` event → 5 D1 statements (`:946-949`) |
| POST | `/api/cli/event`, `/api/cli/batch` | `handlers/telemetry.ts` | license key | 1 MiB Content-Length gate (`telemetry.ts:15,34-48`), string truncation (`:56-88`), rate limit fail-open (`:98-106`) |
| POST | `/api/docs/analytics` | `handlers/docs-analytics.ts:35` | none | 50-event cap (`:63-66`), IP rate limit fail-open (`:44-52`) |
| POST | `/api/site/analytics/track` | `handlers/site-analytics.ts:248` | none | `MAX_EVENTS_PER_BATCH = 50` (`:162,269`), IP rate limit fail-open (`:257-263`) |
| POST | `/api/internal/site-session` | `handlers/site-session.ts:mintSiteSession :170` | static `X-Admin-Secret` | public-domain reachable; role minting — p4-005/p5-001 |
| GET | `/api/badge/installs` | `worker.ts:87-121` | none | `COUNT(DISTINCT install_id)` over `install_stats` (`worker.ts:90`), cached 60 s |
| GET | `/api/github-stats` | `handlers/github-proxy.ts` | none | fixed origin; CORS re-derived per request (verified sound) |
| POST | `/api/stripe/webhook` | `handlers/billing.ts:388` | HMAC signature gate | verified verify-before-parse |
| * | `/api/admin/*`, `/api/dashboard`, `/api/team/*`, sessions/machines/audit routes | various | bearer session (+admin flag where applicable) | P5 matrix: zero missing guards found |

## 2. Attacker sources (unauthenticated)

- JSON bodies: `{email}`, `{email, code}`, event batches (`events[]` with arbitrary nested
  `properties` records), install pings, Stripe raw body (signed).
- Query params: `key`, `machine_id`, `user_name`, `user_email`, `email`, `since`, `limit`, `days`.
- Headers: `X-Admin-Secret`, `Authorization: Bearer`, `stripe-signature`, `Origin`,
  edge-set `CF-Connecting-IP` / `User-Agent` / `CF-IPCountry`.
- Attacker-chosen database keys: `auth_codes.email` (quota key), `install_stats.install_id`
  (row key), `analytics_errors.error_message` (upsert key), `analytics_daily.dimension`
  (event_name/platform/version → one row per distinct value/day).

## 3. Sinks

- D1 writes (shared Free-plan database `omg-platform`, both workers): `analytics_events`,
  `analytics_daily`, `analytics_errors`, `analytics_active_users`, `install_stats`,
  `docs_analytics_*`, `site_analytics_*`, `usage_daily`, `usage_member_daily`,
  `analytics_packages`, plus auth/session/licensing writes.
- Email send binding (`EMAIL.send`, OTP plaintext — `auth.ts:139-152`).
- Crypto: HMAC-SHA256 OTP digest (`otp.ts:31-46`), JWT HS256/EdDSA sign
  (`license.ts:807-877`), Stripe webhook HMAC.
- Outbound fetches: siteverify, api.stripe.com, api.github.com — all fixed-origin (verified).
- Cache API (github-proxy): key = full request URL; ACAO never replayed from cache (verified sound).

## 4. Hidden control channels

| Channel | Consumed at | Effect | Verdict this pass |
|---|---|---|---|
| `TURNSTILE_SECRET_KEY` unset | `auth.ts:186-188` | bot check silently skipped | known (p4-001) |
| `AUTH_RATE_LIMITER` / `ADMIN_RATE_LIMITER` bindings | declared `wrangler.toml:22-32`, **zero call sites** (grep across src) | claimed brute-force protection does not exist | known (p5-002/p7-003) |
| `API_RATE_LIMITER` bound but not called by `handlers/license.ts` | grep: call sites only in `telemetry.ts:105`, `site-analytics.ts:258`, `docs-analytics.ts:45` | `/api/analytics` and `/api/install-ping` ingest with **no rate limiting at all** | **new — p8-001/p8-002** |
| `license_key` absence on `/api/analytics` events | `license.ts:905-908` | events skip telemetry policy entirely (anonymous passthrough) | **new — feeds p8-001** |
| `attempt_count` burn on wrong-code submissions | `auth.ts:363-374` | 5 junk submissions invalidate victim's active OTP | **new — p8-003** |

## 5. Exploit-relevant paths selected for hypothesis testing

1. **Anonymous write-flood into shared D1 via `/api/analytics`** — unbounded batch ×
   5 statements/command-event × unlimited distinct upsert keys, no throttle.
2. **`/api/install-ping` row inflation** — unique `install_id` per request, unthrottled,
   pollutes public badge.
3. **OTP attempt-burnout login DoS** — single-active-code policy + failure-path counter +
   no IP throttle/captcha ⇒ trivial lockout of any email's sign-in.
4. Checked and cleared: CSV formula injection (`escapeCSV` handles `=+-@` prefixes,
   `admin.ts:374-388` — sound); stored XSS render chain (zero `innerHTML`/`@html` in
   `site/src/**` — grep verified); github-proxy cache/CORS (sound); firehose param
   handling (clamped, parameterized — sound); OTP generator entropy/unbiasing
   (`otp.ts` — sound); admin route guards (re-affirmed present).
