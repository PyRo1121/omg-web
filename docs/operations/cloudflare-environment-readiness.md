# Cloudflare environment readiness

**Last inventory/provisioning pass:** 2026-08-25

**Deployment status:** production is live on `omg.latham.cloud` and `omg-api.latham.cloud`; an isolated Alchemy-managed SvelteKit shadow is live only on `workers.dev`

This document records the deployed Cloudflare topology, the free-tier usage ceilings it must never exceed, and the remaining steps to finish production hardening.

## Deployed topology (free plan)

| Kind                        | Resource                                                | Repository authority                           | Public URL                                                                           |
| --------------------------- | ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Worker                      | `omg-saas`                                              | `site/workers/wrangler.toml`                   | `https://omg-api.latham.cloud`                                                       |
| Worker + static assets      | `omg-site`                                              | `site/wrangler.toml`                           | `https://omg.latham.cloud`                                                           |
| D1 (single shared database) | `omg-platform` / `fee8ddab-fb4a-4be4-b8d2-8abb7c2db188` | Worker migrations; Wrangler + Alchemy bindings | n/a                                                                                  |
| SvelteKit shadow Worker     | `omgsveltesite-website-shadow-jav5h3wa32bnkqce`         | `site-svelte/alchemy.run.ts`                   | `https://omgsveltesite-website-shadow-jav5h3wa32bnkqce.latham.workers.dev`           |
| Alchemy state Worker + DO   | `alchemy-state-store`                                   | Alchemy bootstrap                              | `https://alchemy-state-store.latham.workers.dev` (authenticated state protocol only) |

Both production hostnames are Workers Custom Domains on the `latham.cloud` zone; Cloudflare provisions DNS and certificates automatically. Both production Workers have their `workers.dev` application surface disabled. The SvelteKit shadow deliberately uses only a generated `workers.dev` hostname, has no production route or binding, and adds `X-Robots-Tag: noindex, nofollow` outside an explicit `prod` stage.

Alchemy's Cloudflare state backend adds one infrastructure-only Worker backed by a SQLite Durable Object and stores its bearer token and encryption key in the account Secrets Store. No application Durable Object was added. The state endpoint is not an application origin and its credentials must never be printed, committed, or copied into project environment files.

Deliberately **not provisioned** (free-tier and ownership constraints):

- `omg-router` and `omg-releases` Workers: `/docs` links point at the GitHub README until a docs product returns, and release artifacts are delivered from GitHub Releases by `install.sh` (with a `_redirects` fallback).
- All R2 buckets (`omg-assets`, `omg-releases`, `omg-releases-preview`): metered storage/operations can exceed the free allowance, so binary downloads stay on GitHub Releases.
- Workers AI binding: removed with the AI insights feature; inference is a paid metered product.
- Separate auth/analytics D1 databases: the Free plan allows 10 databases per account and this account already holds ten unrelated databases (11 total including `omg-platform`, re-counted 2026-08-23 via the D1 API). One physical database is used with strict table-level ownership instead.
- Application Durable Objects: the only Durable Object is Alchemy's encrypted deployment-state backend; OMG runtime behavior does not depend on a Durable Object.

### Shared-database ownership contract

`omg-platform` is one physical D1 database with two owners:

- Better Auth owns exactly `auth_user`, `auth_session`, `auth_account`, and `auth_verification` (`migrations/013_better_auth.sql` plus the `014_better_auth_issuer.sql` column addition, mirrored in `site/shared/auth-schema.ts`). The SaaS Worker must not write them.
- The SaaS Worker owns every other table created by migrations `0000`–`012`. The site must not write licensing/telemetry tables directly.

The canonical migration sequence lives only in `site/workers/migrations/`; integrity is enforced by `migrations.sha256`. Migrations were applied remotely on 2026-08-21 via `wrangler d1 migrations apply DB --remote`.

#### Remote migration inventory (keep current)

After **every** `npm run db:migrate:remote --prefix site/workers`, record here which migrations `d1_migrations` contains (query: `SELECT name FROM d1_migrations ORDER BY id`) and the date. At 3am the on-call answer to "is prod past the merge?" must be readable from this file, not from a live query.

- 2026-08-21 — all migrations through the sequence as of that date were applied via `wrangler d1 migrations apply DB --remote`; per-file list not captured at apply time. Backfill this list on the next remote apply.

Gate every remote apply on a green `npm run check:migrations` against the commit being deployed from; the hash manifest provides tamper-evidence, not authorization, so never apply from a tree that fails CI.

Known no-op in the canonical chain: migration `015_customers_email_unique.sql` silently did nothing (explained in `016_customers_email_unique_enforced.sql`'s header). It is retained for immutability — do not "re-apply 015 to fix" uniqueness.

### Secrets (server-only, set via `wrangler secret put`)

- `omg-saas`: `JWT_SECRET`, `JWT_PRIVATE_KEY` (Ed25519 PKCS#8 PEM), `ADMIN_API_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `omg-site`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://omg.latham.cloud`, `ADMIN_API_SECRET` (same value as `omg-saas`)
- Optional, unset until their features are enabled: `TURNSTILE_SECRET_KEY`, `SENTRY_DSN`, OAuth client credentials. Note: `RESEND_API_KEY` is not read by any runtime code — OTP delivery uses the native `EMAIL` send binding and remains disabled per the remaining steps below.

License JWTs are EdDSA-only. Verifiers must pin `alg=EdDSA`, `kid=omg-license-ed25519-v1`, `iss=https://omg-api.latham.cloud`, and `aud=omg-cli`; they must never select an algorithm from an untrusted JWT header. The matching public key is published at `https://omg.latham.cloud/.well-known/omg-license-ed25519-v1.pem`. Rotate by introducing a new key ID and serving both public keys during the bounded one-hour token overlap; never reuse `JWT_SECRET` for license signing.

Stripe secrets are server-only on `omg-saas`; billing routes are unlocked and no longer return `503`.

### Stripe live-mode wiring (2026-08-24)

Stripe live mode is active on account `acct_1TpcWPPI6tkdUQSc`; charges and payouts are enabled and account details are submitted.

- Products: `prod_V8Aw8jOdyDpka9` (OMG Pro), `prod_V8AwOQr4PMi9Ra` (OMG Team).
- Live prices, set as server-owned vars in `site/workers/wrangler.toml`:
  - `STRIPE_PRO_PRICE_ID=price_1U7ub2PI6tkdUQScfVcPeLY9` ($9/month Pro)
  - `STRIPE_TEAM_PRICE_ID=price_1U7ub3PI6tkdUQScFqTRFgv8` ($200/month Team)
- Introductory offer coupon `omg_intro_20_3mo_v1` provides 20% off for three months and is restricted to those two products. The Worker creates one first-transaction, single-redemption promotion code per normalized email; checkout applies it only when the authenticated account uses that same email.
- Live webhook endpoint `we_1U7uexPI6tkdUQSclmocHNWo` targets `https://omg-api.latham.cloud/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, and `customer.created`.
- `STRIPE_SECRET_KEY` is a dedicated restricted live key with Promotion Codes Write access; its value and the endpoint signing secret are stored only as `omg-saas` Wrangler secrets.

The historical test-mode catalog remains isolated in Stripe and is not referenced by production. A signed live `customer.created` delivery was processed by the D1 webhook inbox on 2026-08-24 (`status=processed`, one attempt, no error); the no-email smoke customer was deleted immediately. Automated production E2E never creates live Checkout Sessions; controlled release verification must expire its unpaid smoke-test session through Stripe CLI.

## Free-tier ceilings that gate this design

| Service              | Free allowance                       | How this deployment stays under it                                                                                                                                                                                    |
| -------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers requests     | 100,000/day; 10 ms CPU               | Static asset requests are free; only SSR/API invokes a Worker. Rate limiters bound abusive routes.                                                                                                                    |
| D1 rows read/written | 5M read / 100k written per day       | Single indexed database. Retention pruning covers docs analytics and 12-month introductory-offer leads; licensing, telemetry, session, and audit tables are NOT yet pruned and grow unbounded — see observability.md. |
| D1 storage           | 5 GB account total; 500 MB/database  | One platform database; analytics tables are prunable.                                                                                                                                                                 |
| Workers Logs/Traces  | ~200k events/day, 3-day retention    | Logs at 100%, traces sampled at 1%.                                                                                                                                                                                   |
| R2 / Workers AI      | metered beyond small free allowances | Not used at all.                                                                                                                                                                                                      |
| Durable Objects      | free-plan request/storage allowance  | One low-traffic SQLite Durable Object is used only by Alchemy's authenticated state Worker; no application request path reaches it.                                                                                   |
| Secrets Store        | 100 production secrets/account       | Alchemy uses two account secrets for state authentication and encryption; application secrets remain Worker-owned.                                                                                                    |

If sustained traffic approaches any ceiling, the correct response is a capacity decision, not silent overage: reduce ingestion, tighten sampling, or upgrade the plan explicitly.

## Verification gate

Authenticate Wrangler to the intended account, then run:

```bash
npm run check:cloudflare:remote
```

It performs only read operations and exits nonzero if `omg-saas`, `omg-site`, or the `omg-platform` D1 UUID is absent or inaccessible.

## Remaining production steps

1. Configure OAuth provider callback URLs (`https://omg.latham.cloud/api/auth/callback/{github,google}`) in the GitHub/Google consoles when social sign-in is enabled.
2. OTP stays unavailable by design: Workers Paid was declined, so Cloudflare Email Sending to arbitrary recipients is unavailable on the Free plan. Public registration is therefore OAuth-only; password login remains enabled only for existing controlled accounts whose email ownership was verified during provisioning.
3. ~~Configure Stripe live products, prices, restricted key, and webhook endpoint~~ Done (2026-08-24, see the live-mode wiring section). Re-run the controlled checkout/webhook smoke test after billing-code or catalog changes; update checkout success/return URLs only if the domain changes again.
4. Verify Workers observability after first real traffic and exercise the rollback path once: enumerate versions with `npx wrangler deployments list`, then revert with `npx wrangler rollback` (<https://developers.cloudflare.com/workers/wrangler/commands/#rollback>, <https://developers.cloudflare.com/workers/versioning/>).

### Rollback pairing rule

Workers rollback reverts **code only, never D1 schema or data** (<https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/>). A code rollback across a forward migration breaks against the newer schema. Pairing rule:

1. Deploy only expand-compatible migrations (additive columns/tables) before the code that uses them.
2. After any rollback, ship a corrective **forward** migration for anything contracted; never roll schema back.
3. The full expand → backfill → contract sequencing guidance lives in [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md); treat that research note as operational reference until it is folded into this runbook.

### Alchemy migration authority

`site-svelte/` is exact-pinned to Alchemy `2.0.0-beta.74`, Effect `4.0.0-rc.112`, SvelteKit `3.0.0-next.9`, and Vite `8.2.1`. Alchemy's current SvelteKit adapter fails with newer SvelteKit 3 prereleases despite its published peer range, so updates require a successful shadow plan, deploy, browser smoke, and rollback check before lockfile changes are accepted. The generated static-assets layer must keep `runWorkerFirst: true`; otherwise browser HTML navigation is intercepted by the asset fallback and returns a plaintext 404 before SvelteKit runs.

The Alchemy OAuth profile is local and currently limited to account/user read, D1 write, Secrets Store write, Workers Scripts write, Workers Observability read/write, and Workers Tail read. D1 write was added only to adopt `omg-platform` as the shadow site's `DB` binding. `site-svelte/alchemy.run.ts` deliberately assigns no migrations or import files to that resource and pins `RemovalPolicy.retain()` so destroying the shadow stack cannot delete production data; immediately after adoption, a remote read confirmed that no `__alchemy_migrations` table was created. The canonical migration chain remains exclusively `site/workers/migrations/` under Wrangler. DNS, zones, routes, Pages, R2, AI, queues, and container permissions were not granted. Add a permission only in the slice that needs it, then remove it when no longer required.

Do not run `alchemy deploy --adopt` against existing production resources as a bulk operation. During coexistence, Alchemy is authoritative for the new Svelte deployment while the two current production Workers and shared D1 remain under their existing Wrangler owners. Each eventual adoption requires a resource-specific plan, characterization gate, rollback command, and explicit confirmation that the plan does not replace the physical resource.

Useful commands:

```bash
cd site-svelte
npm run plan -- --stage shadow
npm run deploy -- --stage shadow --yes
npm run destroy -- --stage shadow # rollback only the isolated shadow stage
```

The shadow's `workers.dev` hostname is the only intentional secondary application origin. It must remain noindex and receive no production route until a complete URL-path slice passes its observation gate.

The shadow mounts Better Auth `1.7.1` through its SvelteKit handler and reads the retained `omg-platform` binding directly. Its Alchemy-generated `ShadowAuthSecret` is stable, redacted state and is intentionally different from production's write-only `BETTER_AUTH_SECRET`; shadow sessions therefore do not authorize production and must never be presented as cutover-compatible sessions. Email/password signup remains disabled. GitHub OAuth is configured only for the shadow callback; its client ID is a plain Worker binding and its client secret is a Cloudflare `secret_text` binding managed by Alchemy. Google remains unconfigured, and the shadow exists only to characterize the runtime integration. POST auth requests additionally pass through a native `10/60s` per-IP Workers Rate Limiting binding; missing or throwing bindings fail closed, while Cloudflare's documented permissive/eventually-consistent counters remain abuse friction rather than an exact accounting boundary. Live checks on 2026-08-26 confirmed anonymous session lookup (`200 null`), invalid-password rejection (`401`), disabled signup (`400` with no user row written), a complete GitHub OAuth callback with a verified session followed by successful sign-out/session cleanup, security headers, and a subsequent no-op plan.

## Authenticated characterization status

The OAuth-only signup surface and password sign-in for controlled accounts are live-verified against production. Two designated E2E users exist in the platform database (`e2e-user@latham.cloud`, `e2e-admin@latham.cloud`; passwords are provided per-run via `E2E_*` environment variables, never committed):

```bash
cd site && E2E_BASE_URL=https://omg.latham.cloud \
  E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
  E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
  npx playwright test e2e/
```

The suite covers login, dashboard rendering, the authenticated licensing BFF, non-admin authorization redirects, admin authorization with the users CSV export, and logout. It deliberately excludes live Checkout Session creation; use the controlled, immediately-expired smoke procedure described above.

See also:

- [`observability.md`](./observability.md)
- [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md)
- [`../../site/e2e/README.md`](../../site/e2e/README.md)
