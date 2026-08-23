# Public Routes Authorization Matrix — PyRo1121/omg-web

Stage 05 (P6 authorization auditor, deep mode). Commit `6eb3c8e`. Supersedes the P3 best-effort
route inventory for authz purposes; cross-checked against `piolium/codeql-artifacts/entry-points.json`.

**Auth model**: dual principal — (a) Better Auth cookie sessions (omg-site browser surface,
`createAuth().api.getSession`, `site/src/lib/auth.ts`; admin = `user.role === 'admin'` re-read from D1 in
`site/src/lib/admin.ts:requireAdmin`); (b) Worker bearer tokens in shared-D1 `sessions` validated by
`validateSession` (`site/workers/src/api.ts:273`); admin = `customers.admin = 1` checked per-handler.
Internal service-binding route gated solely by constant-time `X-Admin-Secret` compare (`admin-secret.ts`,
fail-closed when unset).

**Key structural fact**: omg-saas has **no middleware layer** — `worker.ts` dispatches an exact
method+path match over the `LicensingRoutes` registry (`site/shared/licensing-routes.ts`). The registry's
`authentication:` field is declarative documentation only; the dispatcher never reads it. Every guard is
Layer-2 (inside handler body) except 4 routes wrapped at Layer-3 by `forbiddenUnlessAdminSession`
(`worker.ts` cases for `/api/docs/analytics/dashboard`, `/api/site/analytics/{geo,realtime,overview}`).
Router-level guard composition therefore does not exist; a new switch case without a guard is silently
public (see drift finding p5-004).

**Hidden control channels**:
- `X-Admin-Secret` header — sole gate on `/api/internal/site-session` (endpoint is on the *public*
  custom domain; only the secret protects it). → p5-001.
- `Origin` header — same-origin requirement inside the BFF (`licensing-bff.ts:requireSameOrigin`);
  GET/HEAD exempt.
- `CF-Connecting-IP` / `User-Agent` — edge-trusted; key rate limits and visitor-ID hashing.
- Rate-limiter bindings fail open when unset (`telemetry.ts:98`, `site-analytics.ts:257`,
  `docs-analytics.ts:44`); `AUTH_RATE_LIMITER`/`ADMIN_RATE_LIMITER` declared in wrangler.toml but never
  referenced by any code. → p5-002.
- No `X-Forwarded-*` / method-override / tenant-header channels are honored by either deployed worker.
  (`workers/router` forwards client `X-Forwarded-*`, but is not deployed.)

**Coverage stats**: 84 endpoints discovered | 3 anomalous-guard endpoints flagged | 41 endpoints taking an
object-id/body-id parameter
**Coverage gaps**: compiled SolidStart `'use server'` functions are hidden nitro RPC endpoints enumerated
best-effort from source markers only; `workers/router` + `workers/releases` are undeployed latent surface;
the out-of-repo Rust CLI consumes the license JWTs (verification logic unauditable here). See
`authz-coverage-gaps.md`.

Legend — L1: declarative middleware/decorator · L2: in-body guard call · L3: router/dispatch wrapper.
Expected scope: `public` / `self` / `org`(n/a — single-tenant customers, team = license-scoped) /
`role:admin` / `cred:<type>` / `internal`.

## omg-saas (`omg-api.latham.cloud`) — exact-switch dispatch

| # | Method | Path | Handler (file:line) | L1 Guard | L2 In-body Authz | L3 Router Guard | Hidden Channels | Object-ID Param | Ownership Check | Tenant Filter | Expected vs Actual |
|---|--------|------|---------------------|----------|------------------|-----------------|-----------------|-----------------|-----------------|---------------|--------------------|
| 1 | GET | /health | worker.ts (inline) | – | none | – | – | – | n/a | n/a | public ✓ |
| 2 | POST | /api/auth/send-code | handlers/auth.ts:530 | – | Turnstile if configured (fail-open); per-email D1 count 3/10min | – | Turnstile secret unset ⇒ skip; **no IP limiter exists** | email | n/a | n/a | public ✓ (control gap → p5-002) |
| 3 | POST | /api/auth/verify-code | handlers/auth.ts:544 | – | OTP atomic claim, attempt_count<5 | – | per-code bound, no IP bound | email, code | n/a | n/a | public ✓ |
| 4 | POST | /api/auth/verify-session | handlers/auth.ts:556 | – | token lookup in body | – | unthrottled token oracle | token | token≡identity | n/a | public-by-design (rate gap → p5-002) |
| 5 | POST | /api/auth/logout | handlers/auth.ts:586 | – | optional token; DELETE WHERE token=? | – | registry declares `'session'`, handler accepts absent token (drift → p5-004) | token | token-scoped | n/a | public/self ✓ |
| 6–7 | GET/POST | /api/validate-license | handlers/license.ts:442 | – | license_key possession (`WHERE l.license_key = ?`, license.ts:346) | – | machine_id optional ⇒ seat accounting skipped (p4-004) | license_key | cred-possession | n/a | cred:lickey ✓ |
| 8 | GET | /api/get-license | handlers/license.ts:512–560 | – | **none — keyed by arbitrary victim email** | – | anonymous reachability | email | **absent** | n/a | expected self/lickey, actual public ⇒ anomaly → p5-003 |
| 9 | POST | /api/report-usage | handlers/license.ts:732 | – | resolveTelemetryIngestion (valid license_key) | – | registry says `'none'`, handler requires LICKEY (drift → p5-004) | license_key | cred-possession | n/a | cred:lickey ✓ |
| 10 | POST | /api/install-ping | handlers/license.ts:769 | – | none | – | – | install_id (self-asserted) | n/a | n/a | public ✓ |
| 11 | POST | /api/analytics | handlers/license.ts:988 | – | LICKEY-optional: events without `license_key` pass through anonymously (license.ts:901-903) | – | raw properties persisted | license_key (optional) | partial (opt-out policy only when key present) | n/a | public-by-design (poisoning dropped Low at P4) |
| 12–13 | POST | /api/cli/event, /api/cli/batch | handlers/telemetry.ts:142,319 | – | valid license_key + API_RATE_LIMITER (fail-open) | – | limiter binding unset ⇒ skip | license_key | cred-possession | n/a | cred:lickey ✓ |
| 14–17 | GET/POST | /api/privacy/{status,export,delete,opt-out} | handlers/privacy.ts:60–65,112,237,418,456 | – | validateSession bearer; all SQL scoped `customer_id = auth.user.id` | – | – | – | present (self) | self-only ✓ | self ✓ |
| 18 | POST | /api/docs/analytics | handlers/docs-analytics.ts:44 | – | IP rate limit only (fail-open) | – | CF-Connecting-IP trusted | – | n/a | n/a | public ✓ |
| 19 | GET | /api/docs/analytics/dashboard | handlers/docs-analytics.ts | – | – | **forbiddenUnlessAdminSession** (worker.ts case) | – | days (clamped) | n/a | admin flag | role:admin ✓ |
| 20 | POST | /api/site/analytics/track | handlers/site-analytics.ts:254 | – | IP rate limit (fail-open); UA/IP HMAC visitor id | – | CF-Connecting-IP | – | n/a | n/a | public ✓ |
| 21–23 | GET | /api/site/analytics/{geo,realtime,overview} | handlers/site-analytics.ts | – | – | **forbiddenUnlessAdminSession** ×3 (worker.ts cases) | – | days | n/a | admin flag | role:admin ✓ |
| 24 | GET | /api/github-stats | handlers/github-proxy.ts | – | none | – | Cache API keyed by full URL (flooding dropped Low at P4) | – | n/a | n/a | public ✓ |
| 25 | POST | /api/internal/site-session | handlers/site-session.ts:mintSiteSession | – | requireAdminSecret (timing-safe, fail-closed, admin-secret.ts:26) | – | **public-domain reachability; static-secret sole gate; body.role drives `customers.admin` write** | email, role | secret-holder only | n/a | internal ⇒ actual internet+secret ⇒ anomaly → p5-001 (Origin-Finding p4-005) |
| 26 | GET | /api/dashboard | handlers/account-dashboard.ts:163 | – | requireSession bearer | – | – | – | self-scoped aggregation | self ✓ | self ✓ |
| 27 | PUT | /api/user/profile | handlers/dashboard.ts:24 | – | validateSession; updates only `company` from allowlisted schema field | – | – | – | `WHERE id = user.id` | self ✓ | self ✓ (no mass assignment — explicit single field) |
| 28 | POST | /api/license/regenerate | handlers/dashboard.ts:53 | – | validateSession | – | – | – | license resolved via `customer_id = ?` | self ✓ | self ✓ |
| 29 | POST | /api/machines/revoke | handlers/dashboard.ts:106 | – | validateSession | – | – | machine_id (body) | `WHERE license_id = ? AND machine_id = ?` (own license) | self ✓ | self ✓ |
| 30 | GET | /api/sessions | handlers/dashboard.ts:157 | – | validateSession | – | – | – | `WHERE customer_id = ?` | self ✓ | self ✓ |
| 31 | POST | /api/sessions/revoke | handlers/dashboard.ts:186 | – | validateSession; blocks current-session self-revoke | – | – | session_id (body) | `DELETE ... AND customer_id = ?` | self ✓ | self ✓ |
| 32 | GET | /api/audit-log | handlers/dashboard.ts:297 | – | validateSession + Team/Enterprise tier gate (403 otherwise) | – | tier-gated feature | – | `WHERE customer_id = ?` | self ✓ | self+tier ✓ |
| 33 | GET | /api/team/members | handlers/dashboard.ts:340 | – | validateSession + Team/Enterprise tier gate | – | – | – | all queries bind own `license.id` | self(license)-scoped ✓ | self ✓ |
| 34 | GET | /api/team/policies | handlers/dashboard.ts | – | validateSession | – | placeholder returns [] | – | n/a | self ✓ | self ✓ |
| 35 | GET | /api/team/notifications | handlers/dashboard.ts | – | validateSession | – | placeholder returns [] | – | n/a | self ✓ | self ✓ |
| 36 | GET | /api/team/audit-logs | handlers/dashboard.ts:297 (shared) | – | validateSession + tier gate | – | – | – | `WHERE customer_id = ?` | self ✓ | self ✓ |
| 37 | POST | /api/team/revoke | handlers/dashboard.ts:394 | – | validateSession | – | – | machine id (body) | `UPDATE machines ... WHERE license_id = ? AND id = ?` (own license) | self ✓ | self ✓ |
| 38 | GET | /api/admin/dashboard | handlers/admin.ts:413 | – | withAdminContext→validateAdmin (admin.ts:253–286): bearer + D1 `customers.admin` flag + unauthorized-access audit log | – | – | – | n/a (global read) | role:admin ✓ |
| 39 | GET | /api/admin/users | handlers/admin.ts:617 | – | withAdminContext | – | – | pagination params | n/a | role:admin ✓ |
| 40–41 | GET/PUT | /api/admin/user | handlers/admin.ts:683,761 | – | withAdminQuery / withAdminContext | – | – | id (query) / userId,tier,status (body) | admin-only by design; update schema is explicit allowlist (tier/status only — **no `admin` field**, no mass assignment) | role:admin ✓ |
| 42 | GET | /api/admin/activity | handlers/admin.ts:788 | – | withAdminContext | – | – | – | n/a | role:admin ✓ |
| 43 | GET | /api/admin/health | handlers/admin.ts:808 | – | withAdminContext | – | – | – | n/a | role:admin ✓ |
| 44 | GET | /api/admin/cohorts | handlers/admin.ts:1013 | – | withAdminContext | – | – | days | n/a | role:admin ✓ |
| 45 | GET | /api/admin/revenue | handlers/admin.ts:1052 | – | withAdminContext | – | – | days | n/a | role:admin ✓ |
| 46 | GET | /api/admin/analytics | handlers/admin.ts:855 | – | withAdminContext | – | – | days/limit clamped | n/a | role:admin ✓ |
| 47–49 | GET | /api/admin/export/{users,usage,audit} | handlers/admin.ts:1090,813,834 | – | withAdminContext (PII CSV exports) | – | – | – | n/a | role:admin ✓ |
| 50 | GET | /api/admin/audit-log | handlers/admin.ts:1130 | – | withAdminContext | – | – | – | n/a | role:admin ✓ |
| 51–54 | GET/POST/PUT/DELETE | /api/admin/notes | handlers/admin.ts:1393,1426,1460,1502 | – | withAdminContext ×4 (worker.ts handleAdminNotesRoute) | – | – | note id (body) | admin-only CRUD | role:admin ✓ |
| 55–56 | GET/POST | /api/admin/tags | handlers/admin.ts:1530,1589 | – | withAdminContext ×2 | – | – | tag id | admin-only | role:admin ✓ |
| 57–59 | GET/POST/DELETE | /api/admin/customer-tags | handlers/admin.ts:1557,1623,1664 | – | withAdminContext ×3 (worker.ts handleAdminCustomerTagsRoute) | – | – | customerId/tagId | admin-only | role:admin ✓ |
| 60 | GET | /api/admin/customer-health | handlers/admin.ts:1698 | – | withAdminContext | – | – | customerId | admin-only | role:admin ✓ |
| 61 | GET | /api/admin/advanced-metrics | handlers/admin.ts:1151 | – | withAdminContext | – | – | – | n/a | role:admin ✓ |
| 62 | GET | /api/admin/firehose | handlers/firehose.ts:12 | – | inline: bearer + D1 `SELECT admin FROM customers` + `customerIsAdmin` (firehose.ts:23–29) — NOT withAdminContext (style outlier, guard present) | – | limit clamp [1,100] | limit/since | n/a | role:admin ✓ |
| 63 | POST | /api/stripe/webhook | handlers/billing.ts:388 | – | verifyStripeSignature HMAC ±300s timing-safe; inbox claim INSERT OR IGNORE + lease | – | stripe-signature header | event ids | signature-holder | n/a | cred:stripe ✓ |
| 64 | POST | /api/billing/portal | handlers/billing.ts:409 | – | authenticate (bearer); **foreign `email` in body requires forbiddenUnlessAdminSession** (billing.ts:416–420) | – | body.email as privilege trigger — correctly gated | email (body) | own-email default; foreign email admin-gated ✓ | self ✓ |
| 65 | POST | /api/billing/checkout | handlers/billing.ts:345 | – | authenticate (bearer); offer→price allowlist; email always from session (never body) | – | – | offer enum | self ✓ | self ✓ |
| 66–67 | POST/GET | /api/admin/stripe/{sync,metrics} | handlers/billing.ts:658,807 | – | requireAdmin (bearer + admin flag + STRIPE key, billing.ts:103) | – | – | – | n/a | role:admin ✓ |
| 68 | GET | /api/badge/installs | worker.ts:20 (inline) | – | none | – | cached 60s | – | n/a | n/a | public ✓ |

## omg-site (`omg.latham.cloud`) — SolidStart

| # | Method | Path | Handler | L1/L2/L3 Guards | Hidden Channels | Expected vs Actual |
|---|--------|------|---------|-----------------|-----------------|--------------------|
| 69–73 | GET | /, /login, /signup, robots.txt, sitemap.xml | src/routes/*.tsx | none (marketing/SSR) | – | public ✓ |
| 74 | GET | /dashboard | src/routes/dashboard.tsx:10 `'use server'` requireAuth | Better Auth getSession else redirect /login | – | self ✓ |
| 75 | GET | /admin | src/routes/admin.tsx:17 `'use server'` requireAdminPage → lib/admin.ts:35 | getSession + D1 `user.role !== 'admin'` ⇒ 403→redirect /dashboard | role re-read from DB, strict equality | role:admin ✓ |
| 76 | * | /api/auth/[...auth] | src/routes/api/auth/[...auth].ts:33 | Better Auth handler; trustedOrigins=[baseUrl]; no plugins (role not client-settable at signup — verified `additionalFields` absent in lib/auth.ts) | CORS hardcoded + credentials:true | public-by-design (sign-in/up/OAuth callbacks) ✓ |
| 77 | GET | /api/dashboard | src/routes/api/dashboard.ts:82,153 | auth.api.getSession else 401 | – | self ✓ |
| 78 | ALL | /api/licensing/[...path] (GET/POST/PUT/PATCH/DELETE) | src/routes/api/licensing/[...path].ts:141 + lib/licensing-bff.ts | L2 chain: getSession (401) → D1 role re-read → isSiteBffRoute allowlist → same-origin for non-GET (403) → 1MiB body cap → X-Admin-Secret mint → Bearer proxy; strips Set-Cookie/CORS downstream | Origin header; minted identity carries role into `/api/internal/site-session` (CFD-1 invariant) | self / role:admin passthrough ✓ (escalation path = p4-005/p5-001) |
| 79–80 | RPC | compiled `'use server'` fns (dashboard.tsx:16, admin.tsx:20) | nitro server-fns manifest | per-function requireAuth / requireAdminPage | hidden generated URLs (enumeration gap) | self / role:admin ✓ (best-effort) |

## Non-deployed / scheduled (latent surface)

| # | Kind | Entry point | Guards | Notes |
|---|------|-------------|--------|-------|
| 81 | Worker (not deployed) | workers/router/src/index.ts catch-all proxy | fixed-origin fetches; forwards client X-Forwarded-* | becomes live header-injection surface if deployed (dropped env/Low at P4) |
| 82 | Worker (not deployed) | workers/releases/src/index.ts GET /download/:filename | filename used directly as R2 object key | path-traversal review needed before any deploy |
| 83 | Cron | worker.ts scheduled() 02:00 UTC → cleanupDocsAnalytics | not attacker-reachable | listed for completeness |

## Positive structural results

- **No missing guards on the authenticated plane.** All 10 session-dashboard handlers, all 4 privacy
  handlers, account-dashboard, billing checkout/portal, and every one of the ~26 admin entry points carry
  a verified in-body guard; every SQL statement touching user-owned rows binds `customer_id`/
  `license_id = auth.user.id`-derived values (BOLA sweep clean).
- **No vertical-escalation primitive in-body**: `handleAdminUpdateUser` allowlist is tier/status only;
  Better Auth config exposes no client-settable `role`; `mintSiteSession` role projection is reachable
  only with ADMIN_API_SECRET (risk concentrated in p5-001/p4-005).
- **No mass assignment**: profile update writes exactly one allowlisted column; admin user update uses an
  explicit two-field schema; Effect Schema decodes all bodies at the boundary.
