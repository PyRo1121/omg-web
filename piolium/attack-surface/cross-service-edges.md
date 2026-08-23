# Cross-Service Edges — Stage 09 (P9, Cross-Service Data Flow)

Commit `6eb3c8e` (main). Machine-readable map: `cross-service-edges.json`.
Scope: edges between deployable components that single-codebase SAST and per-component
Deep Probe cannot follow. External third-party calls (Stripe REST, Turnstile siteverify,
CF Email Sending) are ingress/egress, not inter-service peers, and are excluded per policy.

## Services

| Service | Root | Status |
|---|---|---|
| omg-site | `site/` (SolidStart SSR → `dist/_worker.js`) | deployed, omg.latham.cloud (+`*.workers.dev`, workers_dev=true) |
| omg-saas | `site/workers/src/` | deployed, omg-api.latham.cloud |
| router | `workers/router/` | **latent** — in-repo, not deployed |
| releases | `workers/releases/` | **latent** — in-repo, not deployed |

Shared substrate: one physical D1 database `omg-platform` (`fee8ddab-…`) bound as `DB` in
**both** deployed wrangler.toml files; service binding `LICENSING_API` (omg-site → omg-saas).

## Edge table

| ID | Channel | Producer (file:line) | Consumer (file:line) | Boundary controls | Attacker-reachable data |
|---|---|---|---|---|---|
| E001 | https | browser → `routes/api/licensing/[...path].ts:130` | omg-site BFF handler | Better Auth session; same-Origin for non-GET; downstream route allowlist | full body ≤1MiB, query, method |
| E002 | service-binding | `lib/licensing-bff.ts:281` | `workers/src/worker.ts` switch (~24 allowlisted site-bff routes) | exact-path allowlist after normalization (`shared/licensing-routes.ts:438-449`); 1MiB cap; response header stripping; minted bearer replaces cookies | raw body bytes + full query string forwarded verbatim |
| E003 | service-binding | `licensing-bff.ts:167` (POST /api/internal/site-session + X-Admin-Secret) | `worker.ts:255` → `handlers/site-session.ts:179` | timing-safe shared secret, fail-closed unset (`admin-secret.ts:22-32`); Effect Schema body decode | email/name/role projected from Better Auth identity. ⚠ endpoint also on public custom domain — already filed as p4-005/p5-001 (not re-filed) |
| E004 | db-table (shared D1) | omg-site writes `auth_user.role`; BFF reads it at `[...path].ts:88-97` | `site-session.ts:103-117` `syncCustomerRole` → `UPDATE customers SET admin=?` | literal-typed both ends; consumer does NOT independently re-derive role — trusts projection | false-trust marker (`role`/`admin` flag); no in-repo write primitive today (P6 verified) |
| E005 | db-table (shared D1) | omg-saas `provisionSiteCustomer` (`site-session.ts:66-100`) writes customers/licenses with Better Auth name/email | omg-site declares worker tables in its drizzle schema (`db/auth-schema.ts:93-226`) — capability by convention; no direct reads today | none — same database_id bound to both workers; D1 has no per-binding permissions | attacker-chosen own email/name persisted cross-service |
| E006 | db-table (unversioned VIEW) | omg-site-authored `auth_user` columns | `handlers/admin.ts:653` `FROM user_stats` (also `:1032 user_cohorts`) | **view defined in no migration in the repo** → filed p9-002 | unknown column surface into admin CRM responses |
| E007 | http proxy | `workers/router/src/index.ts:35,130` → env-fixed MAIN_SITE/DOCS_SITE | external origins | fixed origins; header rewriting | LATENT — deployment-gate review only (P4 Low/env) |
| E008 | r2 | `workers/releases/src/index.ts:6` | external CLI downloads | key non-empty check | LATENT |

## Edge totals

8 edges: 3 http/service-binding-http (E001–E003), 3 db-write-driven (E004–E006),
1 http-proxy latent (E007), 1 r2 latent (E008). 0 gRPC, 0 queue (no broker in repo;
Stripe webhook is external ingress covered by DFD-3/p4-002).

## Boundary sanitization assessment (Step 3 propagation)

- **E001/E002**: producer-side validation is unusually strong (allowlist + size cap +
  response-header stripping + fresh identity re-read per request). Downstream handlers
  clamp `days`/`limit` and Schema-decode bodies. No incompatible-sanitization gap found.
- **E003**: secret-gated, fail-closed, constant-time compare. Residual risk is the
  *public reachability* of the internal route (p5-001) and single-secret compromise
  blast radius (p4-005) — both previously drafted.
- **E004**: transitive-trust marker (role→admin flag) verified to have no in-repo write
  primitive outside ADMIN_API_SECRET; storage-plane design risk filed as p9-001.
- **E006**: cannot audit what flows through `user_stats`/`user_cohorts` because the view
  definitions are absent from every migration directory — filed as p9-002.
- Cleared: no cross-service SSRF (router origins are env constants); no queue channels;
  Stripe replay mitigations already assessed (DFD-3).

## Coverage gaps

1. `user_stats` / `user_cohorts` CREATE VIEW absent from `site/workers/migrations/`,
   `migrations-legacy/`, and `site/drizzle/migrations/` (grep-verified). Either manually
   created out-of-band or dead code producing guaranteed 500s in admin CRM.
2. Latent workers (router/releases): edges unreachable until deployed; no package.json for
   releases (SBOM gap).
3. Out-of-repo Rust CLI performs all license-JWT verification — half the licensing
   protocol unauditable here.
4. Nitro server-fns endpoints exist only post-build.

## Drafts filed

| Draft | Class | Severity | Edge |
|---|---|---|---|
| `findings-draft/p9-001-shared-d1-ownership-by-convention.md` | transitive-trust | MEDIUM | E004, E005 |
| `findings-draft/p9-002-admin-crm-unversioned-user-stats-view.md` | dead-channel | MEDIUM | E006 |
