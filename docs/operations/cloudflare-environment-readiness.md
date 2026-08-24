# Cloudflare environment readiness

**Last inventory/provisioning pass:** 2026-08-23

**Deployment status:** live on `omg.latham.cloud` and `omg-api.latham.cloud` (Workers Custom Domains)

This document records the deployed Cloudflare topology, the free-tier usage ceilings it must never exceed, and the remaining steps to finish production hardening.

## Deployed topology (free plan)

| Kind                        | Resource                                                | Repository authority         | Public URL                     |
| --------------------------- | ------------------------------------------------------- | ---------------------------- | ------------------------------ |
| Worker                      | `omg-saas`                                              | `site/workers/wrangler.toml` | `https://omg-api.latham.cloud` |
| Worker + static assets      | `omg-site`                                              | `site/wrangler.toml`         | `https://omg.latham.cloud`     |
| D1 (single shared database) | `omg-platform` / `fee8ddab-fb4a-4be4-b8d2-8abb7c2db188` | both wrangler configs        | n/a                            |

Both hostnames are Workers Custom Domains on the `latham.cloud` zone; Cloudflare provisions DNS and certificates automatically. The `omg-saas` workers.dev hostname is disabled; the site's workers.dev hostname remains available as a fallback.

Deliberately **not provisioned** (free-tier and ownership constraints):

- `omg-router` and `omg-releases` Workers: `/docs` links point at the GitHub README until a docs product returns, and release artifacts are delivered from GitHub Releases by `install.sh` (with a `_redirects` fallback).
- All R2 buckets (`omg-assets`, `omg-releases`, `omg-releases-preview`): metered storage/operations can exceed the free allowance, so binary downloads stay on GitHub Releases.
- Workers AI binding: removed with the AI insights feature; inference is a paid metered product.
- Separate auth/analytics D1 databases: the Free plan allows 10 databases per account and this account already holds ten unrelated databases (11 total including `omg-platform`, re-counted 2026-08-23 via the D1 API). One physical database is used with strict table-level ownership instead.

### Shared-database ownership contract

`omg-platform` is one physical D1 database with two owners:

- Better Auth owns exactly `auth_user`, `auth_session`, `auth_account`, and `auth_verification` (`migrations/013_better_auth.sql` plus the `014_better_auth_issuer.sql` column addition, mirrored in `site/src/db/auth-schema.ts`). The SaaS Worker must not write them.
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

### Stripe test-mode wiring (2026-08-21)

Stripe test mode is wired through the Stripe CLI default profile on account `acct_1TpcWPPI6tkdUQSc`:

- Products: `prod_V7FjJbFXMZAiMP` (OMG Pro), `prod_V7FjM0jbrXHbbk` (OMG Team).
- Test prices, set as vars in `site/workers/wrangler.toml`:
  - `STRIPE_PRO_PRICE_ID=price_1U71F8PI6tkdUQScELAVo5Iz` ($9/month Pro)
  - `STRIPE_TEAM_PRICE_ID=price_1U71F8PI6tkdUQScqu6DuYI4` ($200/month Team)
- Webhook endpoint `we_1U71SyPI6tkdUQScEDqOHUWs` -> `https://omg-api.latham.cloud/api/stripe/webhook`, subscribed to: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.created`.

Checkout session creation is E2E-verified against Stripe test mode. Webhook handling was fixed during verification (`customer.created` null-email and null-currency decode bugs); signature verification and inbox recording are in place. Live webhook delivery was still returning `400` at last check pending a redeploy carrying the currency decode fix — treat this as verification in progress rather than a completed step.

## Free-tier ceilings that gate this design

| Service              | Free allowance                       | How this deployment stays under it                                                                                                                                                                                             |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workers requests     | 100,000/day; 10 ms CPU               | Static asset requests are free; only SSR/API invokes a Worker. Rate limiters bound abusive routes.                                                                                                                             |
| D1 rows read/written | 5M read / 100k written per day       | Single indexed database. Retention pruning currently covers only docs analytics tables (`cleanupDocsAnalytics`); licensing, telemetry, session, and audit tables are NOT yet pruned and grow unbounded — see observability.md. |
| D1 storage           | 5 GB account total; 500 MB/database  | One platform database; analytics tables are prunable.                                                                                                                                                                          |
| Workers Logs/Traces  | ~200k events/day, 3-day retention    | Logs at 100%, traces sampled at 1%.                                                                                                                                                                                            |
| R2 / Workers AI      | metered beyond small free allowances | Not used at all.                                                                                                                                                                                                               |

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
3. ~~Configure Stripe products/prices/webhook secret in test mode first~~ Done (2026-08-21, see the Stripe test-mode wiring section); finish the live webhook delivery verification (redeploy with the currency decode fix and confirm a signed test event is accepted). Update checkout success/return URLs only if the domain changes again.
4. Verify Workers observability after first real traffic and exercise the rollback path once: enumerate versions with `npx wrangler deployments list`, then revert with `npx wrangler rollback` (<https://developers.cloudflare.com/workers/wrangler/commands/#rollback>, <https://developers.cloudflare.com/workers/versioning/>).

### Rollback pairing rule

Workers rollback reverts **code only, never D1 schema or data** (<https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/>). A code rollback across a forward migration breaks against the newer schema. Pairing rule:

1. Deploy only expand-compatible migrations (additive columns/tables) before the code that uses them.
2. After any rollback, ship a corrective **forward** migration for anything contracted; never roll schema back.
3. The full expand → backfill → contract sequencing guidance lives in [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md); treat that research note as operational reference until it is folded into this runbook.

### Secondary origin

The site's `*.workers.dev` fallback hostname remains enabled while the API's is disabled. It serves the same app outside domain-scoped monitoring; either disable it or include it when reviewing Workers Logs (see [`observability.md`](./observability.md)).

## Authenticated characterization status

The OAuth-only signup surface and password sign-in for controlled accounts are live-verified against production. Two designated E2E users exist in the platform database (`e2e-user@latham.cloud`, `e2e-admin@latham.cloud`; passwords are provided per-run via `E2E_*` environment variables, never committed):

```bash
cd site && E2E_BASE_URL=https://omg.latham.cloud \
  E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
  E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
  npx playwright test e2e/
```

The suite covers login, dashboard rendering, the authenticated licensing BFF, non-admin authorization redirects, admin authorization with the users CSV export, and logout. The Stripe checkout check (gated behind `E2E_ALLOW_MUTATIONS=true` for an isolated sandbox) is now E2E-verified against Stripe test mode; live webhook delivery is still pending a redeploy (see the Stripe test-mode wiring section above).

See also:

- [`observability.md`](./observability.md)
- [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md)
- [`../../site/e2e/README.md`](../../site/e2e/README.md)
