# Cloudflare environment readiness

**Last inventory/provisioning pass:** 2026-08-21

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
- Separate auth/analytics D1 databases: the Free plan allows 10 databases per account and this account already holds nine unrelated databases. One physical database is used with strict table-level ownership instead.

### Shared-database ownership contract

`omg-platform` is one physical D1 database with two owners:

- Better Auth owns exactly `auth_user`, `auth_session`, `auth_account`, and `auth_verification` (`migrations/013_better_auth.sql`, mirrored in `site/src/db/auth-schema.ts`). The SaaS Worker must not write them.
- The SaaS Worker owns every other table created by migrations `0000`–`012`. The site must not write licensing/telemetry tables directly.

The canonical migration sequence lives only in `site/workers/migrations/`; integrity is enforced by `migrations.sha256`. Migrations were applied remotely on 2026-08-21 via `wrangler d1 migrations apply DB --remote`.

### Secrets (server-only, set via `wrangler secret put`)

- `omg-saas`: `JWT_SECRET`, `ADMIN_API_SECRET`
- `omg-site`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://omg.latham.cloud`, `ADMIN_API_SECRET` (same value as `omg-saas`)
- Optional, unset until their features are enabled: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `SENTRY_DSN`, OAuth client credentials. Billing routes return `503` until `STRIPE_SECRET_KEY` exists.

## Free-tier ceilings that gate this design

| Service              | Free allowance                       | How this deployment stays under it                                                                 |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Workers requests     | 100,000/day; 10 ms CPU               | Static asset requests are free; only SSR/API invokes a Worker. Rate limiters bound abusive routes. |
| D1 rows read/written | 5M read / 100k written per day       | Single indexed database; telemetry retention jobs prune daily.                                     |
| D1 storage           | 5 GB account total; 500 MB/database  | One platform database; analytics tables are prunable.                                              |
| Workers Logs/Traces  | ~200k events/day, 3-day retention    | Logs at 100%, traces sampled at 1%.                                                                |
| R2 / Workers AI      | metered beyond small free allowances | Not used at all.                                                                                   |

If sustained traffic approaches any ceiling, the correct response is a capacity decision, not silent overage: reduce ingestion, tighten sampling, or upgrade the plan explicitly.

## Verification gate

Authenticate Wrangler to the intended account, then run:

```bash
npm run check:cloudflare:remote
```

It performs only read operations and exits nonzero if `omg-saas`, `omg-site`, or the `omg-platform` D1 UUID is absent or inaccessible.

## Remaining production steps

1. Configure OAuth provider callback URLs (`https://omg.latham.cloud/api/auth/callback/{github,google}`) in the GitHub/Google consoles when social sign-in is enabled.
2. OTP email delivery requires either Workers Paid (Cloudflare Email Sending to arbitrary recipients is unavailable on the Free plan) or a third-party sender; until then OTP stays unavailable while email/password sign-up works fully.
3. Configure Stripe products/prices/webhook secret in test mode first; billing stays `503` until then. Update checkout success/return URLs only if the domain changes again.
4. Verify Workers observability after first real traffic and confirm rollback via `wrangler deployments list`.

## Authenticated characterization status

Password sign-up and sign-in are live-verified against production (2026-08-21). Two designated E2E users exist in the platform database (`e2e-user@latham.cloud`, `e2e-admin@latham.cloud`; passwords are provided per-run via `E2E_*` environment variables, never committed):

```bash
cd site && E2E_BASE_URL=https://omg.latham.cloud \
  E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
  E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
  npx playwright test e2e/
```

The suite covers login, dashboard rendering, the authenticated licensing BFF, non-admin authorization redirects, admin authorization with the users CSV export, and logout. The Stripe checkout check remains gated behind `E2E_ALLOW_MUTATIONS=true` for an isolated sandbox.

See also:

- [`observability.md`](./observability.md)
- [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md)
- [`../../site/e2e/README.md`](../../site/e2e/README.md)
