# Architecture Entrypoints — PyRo1121/omg-web

Reusable inventory for Phases 4–11. Commit `6eb3c8e`. Dispatcher: `site/workers/src/worker.ts` (omg-saas, `omg-api.latham.cloud`); SolidStart file routes (`site/src/routes/**`, omg-site, `omg.latham.cloud`).

## omg-saas HTTP routes (exact method+path switch, worker.ts)

Auth keys: NONE (no credential) · SESS (Worker bearer session, `validateSession` on `sessions` table) · ADMIN (SESS + `customers.admin=1`) · SECRET (`X-Admin-Secret` = `ADMIN_API_SECRET`) · STRIPE (HMAC signature) · LICKEY (license key as bearer credential).

| Route | Method(s) | Auth | Handler | Notable inputs / sinks |
|---|---|---|---|---|
| /health | GET | NONE | inline worker.ts | – |
| /api/auth/send-code | POST | NONE | handlers/auth.ts:handleSendCode | email, turnstileToken? → D1 auth_codes, EMAIL.send; Turnstile fail-open; per-email D1 count only |
| /api/auth/verify-code | POST | NONE | handleVerifyCode | email+code → atomic claim, customer auto-create, session mint (30d) |
| /api/auth/verify-session | POST | token-in-body | handleVerifySession | unthrottled session-token validity oracle |
| /api/auth/logout | POST | optional token | handleLogout | DELETE session if valid |
| /api/validate-license | GET/POST | LICKEY | handleValidateLicense | key, machine_id?, user_name/email? → seat accounting, HS256/EdDSA JWT mint, machines+usage readback |
| /api/get-license | GET | NONE (email-keyed) | handleGetLicense | masked license_key, tier, status, machine count by victim email |
| /api/report-usage | POST | LICKEY | handleReportUsage | usage upserts, package/runtime stats, machine touch |
| /api/install-ping | POST | NONE | handleInstallPing | install_id etc → install_stats |
| /api/analytics | POST | LICKEY-optional | handleAnalytics | event batch → analytics_events/_errors/_daily; properties stored raw |
| /api/cli/event, /api/cli/batch | POST | LICKEY rate-limit key | handleCliEvent/Batch | telemetry with size caps + truncation |
| /api/privacy/status,export,delete,opt-out | GET/POST | SESS | handlers/privacy.ts | subject scope from session only |
| /api/docs/analytics | POST | NONE (IP rate limit, fail-open) | handleDocsAnalytics | batch → docs_* tables |
| /api/docs/analytics/dashboard | GET | ADMIN (router-level) | handleDocsAnalyticsDashboard | days param clamped |
| /api/site/analytics/track | POST | NONE (IP rate limit, fail-open) | handleTrackEvent | events batch → site_* tables; UA/IP HMAC visitor id |
| /api/site/analytics/geo,realtime,overview | GET | ADMIN (router-level) | site-analytics.ts | days param |
| /api/github-stats | GET | NONE | handleGitHubProxy | fixed upstream URL; Cache API per full URL; Origin reflected only within allowlist |
| /api/internal/site-session | POST | SECRET | handleCreateSiteSession (mintSiteSession) | email,name,betterAuthUserId,role → find-or-create customer, **sync customers.admin := role**, mint/reuse session |
| /api/dashboard | GET | SESS | account-dashboard.ts:163 requireSession | aggregated account data |
| /api/user/profile | PUT | SESS | dashboard.ts | profile update |
| /api/license/regenerate, /api/machines/revoke | POST | SESS | dashboard.ts | license/machine mutations |
| /api/sessions, /api/sessions/revoke | GET/POST | SESS | dashboard.ts | session listing/revocation |
| /api/audit-log, /api/team/* (members,policies,notifications,audit-logs,revoke) | GET/POST | SESS | dashboard.ts | team surface — Phase 5 must verify tenant scoping |
| /api/admin/** (22 routes incl. exports/users, export/usage, export/audit CSVs, notes CRUD, tags, stripe sync/metrics, firehose) | mixed | ADMIN (per-handler `withAdminContext`; billing via `requireAdmin`) | handlers/admin.ts, handlers/billing.ts | PII CSV exports; dynamic SET fragment (safe literals); firehose limit clamp |
| /api/stripe/webhook | POST | STRIPE | handleStripeWebhook | signature ±300s; inbox lease; reconcile-from-source for subscriptions; body-trusted inserts for invoice/customer events |
| /api/billing/checkout, /api/billing/portal | POST | SESS (+ADMIN override for portal email) | handleCreateCheckout/handleBillingPortal | offer→price allowlist; portal email admin-gated |
| /api/badge/installs | GET | NONE | inline | cached 60s |

## omg-site (SolidStart) entrypoints

| Surface | Auth | Notes |
|---|---|---|
| `/`, `/login`, `/signup`, robots.txt, sitemap.xml | public SSR | static assets via ASSETS binding |
| `/dashboard` (`routes/dashboard.tsx`) | server fn `requireAuth` (Better Auth getSession) else redirect /login | client-rendered app |
| `/admin` (`routes/admin.tsx`) | server fn `requireAdminPage` → `lib/admin.ts:requireAdmin` (session + `user.role='admin'`) | redirects non-admins to /dashboard |
| `/api/auth/[...auth]` catch-all | Better Auth handler (public sign-in/up, OAuth callbacks github/google, sign-out) | trustedOrigins=[BETTER_AUTH_URL origin]; CORS hardcoded omg.latham.cloud + credentials; env assembled from CF context |
| `/api/dashboard` | Better Auth session required | reads better_auth session/account rows for self |
| `/api/licensing/[...path]` (GET/POST/PUT/PATCH/DELETE) | Better Auth session + same-origin (non-GET) + route allowlist (`isSiteBffRoute`) | mints Worker session via service binding w/ X-Admin-Secret, proxies with Bearer; strips Set-Cookie/CORS downstream; 1MiB body cap |
| Compiled `'use server'` functions | per-function guards | hidden nitro RPC surface |

## Non-deployed workers (in-repo)

- `workers/router` (`omg-router`): `/docs*` proxy to fixed DOCS_SITE + fallback proxy of everything else to fixed MAIN_SITE with header rewrite; not deployed.
- `workers/releases` (`omg-releases`): R2 artifact server `GET /latest-version`, `GET /download/:filename` (filename used directly as object key); D1 ANALYTICS_DB binding declared but unused in code; not deployed.

## Attacker-controlled sources

JSON bodies (schema-gated), query strings, `Authorization` bearer, `X-Admin-Secret`, `Origin`, `stripe-signature`, `CF-Connecting-IP` + `User-Agent` (hashed into visitor IDs, stored in audit/session rows), arbitrary nested telemetry `properties` objects persisted verbatim.

## High-value sinks

D1 prepare/bind across all handlers (~100 sites); `EMAIL.send`; Stripe REST fetches; Turnstile siteverify; GitHub API fetch; Cache API put/match; license JWT signing (`crypto.subtle.sign` HS256/EdDSA); HTML string interpolation into OTP email (code only, server-generated); dashboard renderers of DB-sourced strings (second-order XSS candidates: `analytics_errors.error_message`, firehose `properties`, CRM/user fields).
