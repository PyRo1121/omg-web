# Stage 07 (P7) — Specification, Framework Contract & Parser Gaps

Repo: PyRo1121/omg-web @ `6eb3c8e`. Method: spec-to-code-compliance applied to the
Phase 3 "Spec Gap Candidates" plus a full framework-contract / hidden-control-channel
review of the omg-saas dispatch router, the site BFF, SolidStart server functions,
Better Auth wiring, and proxy/cache handlers. No formal RFC is implemented in-repo;
all "specs" are in-repo contracts (config comments, API self-descriptions, email/HTTP
promises, compliance header claims).

## Contracts reviewed and verdicts

| Contract surface | Verdict |
|---|---|
| Route registry `authentication:` field (`site/shared/licensing-routes.ts`) | **No current drift.** Dispatcher (`workers/src/worker.ts`) never enforces `authentication` — it is declarative only. Verified all 26 `/api/admin/*` + stripe-admin handlers wrap `withAdminContext`/`withAdminQuery`/`requireAdmin`; 4 analytics dashboards use router-level `forbiddenUnlessAdminSession`; firehose does an inline admin check; all session routes validate. Latent structural risk only (a future switch case without its guard compiles clean) → recorded here, not drafted (no current exploit path). |
| Path canonicalization (`normalizeLicensingPath`, exact method/path match) | Fail-closed: single trailing-slash strip, case-sensitive, percent-encoding preserved by `URL.pathname` so encoded variants 404. No bypass found. |
| BFF same-origin contract (`src/lib/licensing-bff.ts:requireSameOrigin`) | Fail-closed for missing/mismatched `Origin`; GET/HEAD exempt but downstream responses are CORS-stripped (`sanitizedWorkerResponse` deletes ACAO/Set-Cookie) so cross-origin reads are blocked. No exploitable differential found; `X-Admin-Secret` reachability already tracked as p4-005. |
| Hidden control channels | `CF-Connecting-IP` trusted for rate-limit keys, visitor hashing, audit rows — valid behind CF ingress today (deployment assumption, documented); `workers_dev = true` noted as bypass lane around any custom-domain-only edge rules (no such rules exist to bypass). `Origin` used solely for same-origin/CORS decisions against a fixed allowlist. No spoofable channel drives an authz decision. |
| SolidStart `'use server'` hidden RPC surface | Only two markers (`dashboard.tsx:17`, `admin.tsx:19`); both guard via `auth.api.getSession` + role lookup with redirect on failure. Guards present. But see p7-002: the dashboard guard's env construction silently falls back to a hardcoded secret when the binding is absent. |
| Stripe webhook inbox state machine (`claimStripeEvent`) | Matches its implied contract: `INSERT OR IGNORE` claim, atomic lease UPDATE with 5-min stale reclaim, `processed/busy(409 Retry-After)/invalid(500)` semantics, signature gate ±window upstream. No gap. |
| OTP email promises ("expires in 10 minutes", 5-attempt limit) | Attempt cap implemented (`MAX_OTP_ATTEMPTS=5`, atomic claim). **Expiry promise NOT implemented** → p7-001. |
| Rate-limit bindings documented in wrangler.toml | **AUTH/ADMIN limiters never invoked** → p7-003. |
| GDPR/CCPA deletion & retention claims (`handlers/privacy.ts`) | **Deletion overstates erasure; 30-day retention unenforced** → p7-004. |
| Telemetry opt-out flag | Enforced at both ingest paths (`telemetry-policy.ts`, `handlers/telemetry.ts:161,340`). No gap. |
| Email canonicalization (`shared/site-session.ts:EmailAddress` transform) | trim+lowercase at every boundary consumer (OTP digest, lookups, BFF identity). Consistent; no differential found. |
| `workers/router` client X-Forwarded-* forwarding | Not deployed (P3 recon); previously triaged Low/env. Out of scope per severity filter. |
| github-proxy Cache API keying | Fixed origin fetch, public data, URL-keyed cache; duplicate-header bug already fixed in-file. No gap. |

## Drafted findings (Phase 10 candidates)

| ID | Title | Type | Severity |
|---|---|---|---|
| [p7-001](../findings-draft/p7-001-otp-session-expiry-canonicalization.md) | OTP/session expiry never enforced intra-day (ISO-8601 vs SQLite `datetime('now')` TEXT comparison) | canonicalization | MEDIUM |
| [p7-002](../findings-draft/p7-002-better-auth-secret-dev-fallback.md) | `'dev-secret-change-me'` fallback silently degrades Better Auth verification | runtime-mode | MEDIUM |
| [p7-003](../findings-draft/p7-003-documented-rate-limit-controls-not-implemented.md) | Documented AUTH/ADMIN rate-limit controls have zero call sites | framework-contract | MEDIUM |
| [p7-004](../findings-draft/p7-004-privacy-deletion-retention-promises-not-implemented.md) | GDPR deletion/retention promises contradict implementation | missing-check | MEDIUM |

Cross-references: p7-003 compounds p4-001 (Turnstile fail-open) on the same endpoint;
p7-001 widens the pre-account-hijack window analyzed in Phase 3 DFD-1.
