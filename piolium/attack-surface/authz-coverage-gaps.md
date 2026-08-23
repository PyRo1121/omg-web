# Authorization Coverage Gaps — for Phase 10 chamber review

Endpoints and surfaces the Stage 05 authz auditor could not fully resolve. Each needs manual reasoning,
not just matrix diffing.

| # | Surface | Why unresolved | Suggested chamber action |
|---|---------|----------------|--------------------------|
| 1 | Compiled SolidStart `'use server'` functions (nitro server-fns manifest) | Hidden generated HTTP endpoints; only source-level `'use server'` markers visible (routes/dashboard.tsx:16, routes/admin.tsx:20). Guards verified at source, but the generated URL space and any framework-added handlers are not enumerable statically here. | Build/deploy the site, dump the nitro server-fns manifest, fuzz the endpoint list without session cookies (expect redirects/401s only). |
| 2 | `workers/router` + `workers/releases` (in-repo, not deployed) | Authz posture is moot offline but both become live surface on deploy; router forwards client `X-Forwarded-*` to origins; releases uses `filename` directly as R2 object key. | Gate deploys on a re-audit; test object-key traversal (`../`) and header-rewrite behavior before first release. |
| 3 | Out-of-repo Rust CLI (`PyRo1121/omg`) | Consumes HS256/EdDSA license JWTs signed with dual-use `JWT_SECRET` (p4-003); alg-confusion/key-selection risk lives entirely outside this repo. | Cross-repo audit of JWT verification path; enforce alg allowlist and key separation. |
| 4 | CFD-1 admin-flag sync invariant (`role:'admin'` in mint body ↔ `customers.admin`) | The two admin stores must stay in sync; any primitive that writes Better Auth `user.role='admin'` or `customers.admin=1` outside `mintSiteSession` escalates to full `/api/admin/*`. Source-side verified clean (no client-settable role, no mass-assignment), but runtime drift (manual D1 edits, Stripe-linked flows) is unverifiable statically. | Periodic reconciliation query comparing `better_auth user.role` vs `customers.admin`; alert on divergence. |
| 5 | Rate-limiter binding presence in production (`API_RATE_LIMITER`, `AUTH_RATE_LIMITER`, `ADMIN_RATE_LIMITER`, `TURNSTILE_SECRET_KEY`) | All guards are env-conditional and mostly fail-open; p5-002 covers the never-wired auth limiters, but whether `API_RATE_LIMITER` is actually bound in the deployed environment is a config question, not a code one. | Verify live bindings via `wrangler` secret/binding listing; add a startup check that fails closed when expected bindings are absent. |
| 6 | Shared-D1 schema authority (migrations in `site/workers/migrations` + `migrations-legacy/` + `site/drizzle/migrations`) | Ownership-by-convention between two workers writing the same tables; tenant-scoping correctness depends on which schema actually ran. | Confirm applied-migration set against D1 introspection; verify `customers.admin`, `sessions.customer_id` constraints exist as assumed. |

No endpoints were assigned Expected Scope `unknown` — all 84 enumerated entries had sufficient signal.
