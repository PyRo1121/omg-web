# Cloudflare environment readiness

**Last inventory/provisioning pass:** 2026-08-31

**Deployment status:** Solid and the SaaS API remain live on `omg.latham.cloud` and `omg-api.latham.cloud`; the Alchemy-managed SvelteKit production Worker is deployed but has no public hostname or route; its isolated shadow remains live only on `workers.dev`

This document records the deployed Cloudflare topology, the free-tier usage ceilings it must never exceed, and the remaining steps to finish production hardening.

## Deployed topology (free plan)

| Kind                        | Resource                                                | Repository authority                               | Public URL                                                                           |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Worker                      | `omg-saas`                                              | `workers/api/wrangler.toml`                        | `https://omg-api.latham.cloud`                                                       |
| Worker + static assets      | `omg-site`                                              | `site/wrangler.toml`                               | `https://omg.latham.cloud`                                                           |
| D1 (single shared database) | `omg-platform` / `fee8ddab-fb4a-4be4-b8d2-8abb7c2db188` | Worker migrations; Wrangler + raw Alchemy bindings | n/a                                                                                  |
| SvelteKit production Worker | `omgsveltesite-website-prod-dlaqgfttmir2ky5x`           | `site-svelte/alchemy.run.ts`                       | none; `workers.dev` disabled and no route/domain attached                            |
| SvelteKit shadow Worker     | `omgsveltesite-website-shadow-jav5h3wa32bnkqce`         | `site-svelte/alchemy.run.ts`                       | `https://omgsveltesite-website-shadow-jav5h3wa32bnkqce.latham.workers.dev`           |
| Alchemy state Worker + DO   | `alchemy-state-store`                                   | Alchemy bootstrap                                  | `https://alchemy-state-store.latham.workers.dev` (authenticated state protocol only) |

Both production hostnames are Workers Custom Domains on the `latham.cloud` zone; Cloudflare provisions DNS and certificates automatically. The two hostname-owning production Workers and the unattached Svelte production Worker have their `workers.dev` application surface disabled. The SvelteKit shadow deliberately uses only a generated `workers.dev` hostname, has no production route or domain, and adds `X-Robots-Tag: noindex, nofollow` outside an explicit `prod` stage.

Alchemy's Cloudflare state backend adds one infrastructure-only Worker backed by a SQLite Durable Object and stores its bearer token and encryption key in the account Secrets Store. No application Durable Object was added. The state endpoint is not an application origin and its credentials must never be printed, committed, or copied into project environment files.

Deliberately **not provisioned** (free-tier and ownership constraints):

- `omg-router` and `omg-releases` Workers: live deployment lookup returned Cloudflare code `10007` for both names, confirming neither Worker exists in the account. Their unused source and deployment configuration were removed. Svelte owns `/docs/`, and release artifacts remain on GitHub Releases through the retained installers.
- All R2 buckets (`omg-assets`, `omg-releases`, `omg-releases-preview`): metered storage/operations can exceed the free allowance, so binary downloads stay on GitHub Releases.
- Workers AI binding: removed with the AI insights feature; inference is a paid metered product.
- Separate auth/analytics D1 databases: the Free plan allows 10 databases per account and this account already holds ten unrelated databases (11 total including `omg-platform`, re-counted 2026-08-23 via the D1 API). One physical database is used with strict table-level ownership instead.
- Application Durable Objects: the only Durable Object is Alchemy's encrypted deployment-state backend; OMG runtime behavior does not depend on a Durable Object.

### Shared-database ownership contract

`omg-platform` is one physical D1 database with two owners:

- Better Auth owns `auth_user`, `auth_session`, `auth_account`, `auth_verification`, `auth_organization`, `auth_member`, and `auth_invitation` (`migrations/013_better_auth.sql`, `014_better_auth_issuer.sql`, and `024_better_auth_organizations.sql`). The hidden organization billing link is server-only; the SaaS Worker may read it for entitlement and audit projection but must not mutate Better Auth rows.
- The SaaS Worker owns every other canonical table. The site must not write licensing or telemetry tables directly.

The canonical migration sequence lives only in `workers/api/migrations/`; integrity is enforced by `migrations.sha256`. The current sequence through `025_organization_owner_integrity.sql` is applied remotely.

#### Remote migration inventory (keep current)

After **every** `npm run db:migrate:remote --prefix workers/api`, record here which migrations `d1_migrations` contains (query: `SELECT name FROM d1_migrations ORDER BY id`) and the date. At 3am the on-call answer to "is prod past the merge?" must be readable from this file, not from a live query.

- 2026-08-21 — all migrations through `023_session_token_hashes.sql` were applied remotely.
- 2026-08-28 — `024_better_auth_organizations.sql` applied successfully; a follow-up read-only `sqlite_master` query confirmed the three organization tables and atomic seat trigger.
- 2026-08-28 — `025_organization_owner_integrity.sql` applied successfully; a follow-up `wrangler d1 migrations list DB --remote` reported no pending migrations, and read-only checks confirmed both active-Owner integrity triggers.
- 2026-08-28 — The private organization invitation-email capability was deployed in `omg-saas` version `9ffc8b8e-09e4-45a2-a99b-f33ffaca8658`; the Svelte shadow was updated and its follow-up Alchemy plan was `3 noop`. Anonymous route checks returned `302` for protected roster access, `404` for direct Better Auth organization plugin paths and the public email capability, and `200` for the neutral malformed-invitation state. `wrangler email sending list` reported Email Sending enabled for `latham.cloud` and `codeloud.xyz`; no live recipient smoke email was sent.

Gate every remote apply on a green `npm run check:migrations` against the commit being deployed from; the hash manifest provides tamper-evidence, not authorization, so never apply from a tree that fails CI.

Known no-op in the canonical chain: migration `015_customers_email_unique.sql` silently did nothing (explained in `016_customers_email_unique_enforced.sql`'s header). It is retained for immutability — do not "re-apply 015 to fix" uniqueness.

### Secrets (server-only, set via `wrangler secret put`)

- `omg-saas`: `JWT_SECRET`, `JWT_PRIVATE_KEY` (Ed25519 PKCS#8 PEM), `ADMIN_API_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `omg-site`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://omg.latham.cloud`, `ADMIN_API_SECRET` (same value as `omg-saas`)
- Optional, unset until their features are enabled: `TURNSTILE_SECRET_KEY`, `SENTRY_DSN`, OAuth client credentials. Note: `RESEND_API_KEY` is not read by any runtime code — OTP delivery uses the native `EMAIL` send binding and remains disabled per the remaining steps below.

License JWTs are EdDSA-only. Verifiers must pin `alg=EdDSA`, `kid=omg-license-ed25519-v1`, `iss=https://omg-api.latham.cloud`, and `aud=omg-cli`; they must never select an algorithm from an untrusted JWT header. The matching public key is published at `https://omg.latham.cloud/.well-known/omg-license-ed25519-v1.pem`. Rotate by introducing a new key ID and serving both public keys during the bounded one-hour token overlap; never reuse `JWT_SECRET` for license signing.

Stripe secrets are server-only on `omg-saas`. The routes are configured, but billing is not cutover-ready until the restricted key and the configured catalog belong to the same live account.

### Stripe live-mode wiring (updated 2026-09-01)

The configured products and prices belong to live account `acct_1TpcWPPI6tkdUQSc`; charges and payouts are enabled and account details are submitted.

- Products: `prod_V8Aw8jOdyDpka9` (OMG Pro), `prod_V8AwOQr4PMi9Ra` (OMG Team).
- Live prices, set as server-owned vars in `workers/api/wrangler.toml`:
  - `STRIPE_PRO_PRICE_ID=price_1U7ub2PI6tkdUQScfVcPeLY9` ($9/month Pro)
  - `STRIPE_TEAM_PRICE_ID=price_1U7ub3PI6tkdUQScFqTRFgv8` ($200/month Team)
- Introductory offer coupon `omg_intro_20_3mo_v1` provides 20% off for three months and is restricted to those two products. The Worker creates one first-transaction, single-redemption promotion code per normalized email; checkout applies it only when the authenticated account uses that same email.
- Live webhook endpoint `we_1U7uexPI6tkdUQSclmocHNWo` targets `https://omg-api.latham.cloud/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, and `customer.created`.
- `STRIPE_SECRET_KEY` is a dedicated restricted live key; its value and the endpoint signing secret are stored only as `omg-saas` Wrangler secrets.
- Its least-privilege Stripe surface is Checkout Sessions Write, Billing Portal Sessions Write, Promotion Codes Write, and read access for Customers, Subscriptions, and Balance. Write includes read for the same Stripe resource. No invoice, payment-method, charge, payout, product, price, refund, or account mutation permission is required by the Worker.
- The earlier missing Checkout Sessions Write permission was corrected. The replacement key was then confirmed to belong to a different live Stripe account from the configured products and prices. Rotate `STRIPE_SECRET_KEY` to an equivalently restricted key created in the catalog-owning account, repeat the controlled Checkout redirect, and expire the unpaid session before treating this gate as complete.

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

1. Configure the GitHub OAuth callback URL (`https://omg.latham.cloud/api/auth/callback/github`) in the GitHub console when social sign-in is enabled. Google is intentionally not supported: the product accepts GitHub identities only.
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

The Alchemy OAuth profile is local and currently limited to account/user read, D1 write, Secrets Store write, Workers Scripts write, Workers Observability read/write, and Workers Tail read. D1 write remains on the profile from the earlier shadow-binding work, but Alchemy no longer models or adopts `omg-platform` as a resource. `site-svelte/alchemy.run.ts` binds the existing database to the Website by its stable database identifier through the raw Worker binding API; the plan contains no D1 resource, migrations, import files, or removal policy. The canonical migration chain remains exclusively `workers/api/migrations/` under Wrangler. DNS, zones, routes, Pages, R2, AI, queues, and container permissions were not granted. The approved whole-host cutover will require temporary `workers_routes:write` and zone-read access for Alchemy planning, rollback, and observation; do not add those scopes before the remaining cutover gates pass, and remove them after permanent hostname ownership is established. Add any other permission only in the slice that needs it, then remove it when no longer required.

Do not run `alchemy deploy --adopt` against existing production resources as a bulk operation. During coexistence, Alchemy is authoritative for the new Svelte deployment while the two current production Workers and shared D1 remain under their existing Wrangler owners. Each eventual adoption requires a resource-specific plan, characterization gate, rollback command, and explicit confirmation that the plan does not replace the physical resource.

Useful commands:

```bash
cd site-svelte
npm run plan -- --stage shadow
npm run deploy -- --stage shadow --yes
npm run destroy -- --stage shadow # rollback only the isolated shadow stage
```

The shadow's `workers.dev` hostname is the only intentional secondary application origin. It must remain noindex and receive no production route until a complete URL-path slice passes its observation gate.

The shadow mounts Better Auth `1.7.1` through its SvelteKit handler and reads the retained `omg-platform` binding directly. Its Alchemy-generated `ShadowAuthSecret` is stable, redacted state and is intentionally different from the fresh secret now bound to the unattached production Svelte stage; shadow sessions therefore do not authorize production and must never be presented as cutover-compatible sessions. Email/password signup remains disabled. GitHub OAuth uses stage-specific bindings: client IDs are plain Worker bindings and client secrets are Cloudflare `secret_text` bindings managed by Alchemy. The deployment wrapper requires separate `PRODUCTION_GITHUB_CLIENT_ID` and `PRODUCTION_GITHUB_CLIENT_SECRET` inputs for `--stage prod` and will not silently reuse shadow keyring entries. On 2026-08-31, both production entries were confirmed present in Secret Service and the production client ID was confirmed distinct from the shadow client ID without printing either value. The reviewed shadow updates deployed without rotating its auth secret; live public-route, static-artifact, cache, CSP, auth-session, concealed-internal-route, compact-layout, docs, legal, login, signup, protected-redirect, and invalid-credential checks passed. The production deployment created only `omgsveltesite-website-prod-dlaqgfttmir2ky5x` and its stage-scoped bindings/resources; it has no hostname, route, D1 resource ownership, or existing-Worker adoption. Deployment `1665e7ee-4638-4f86-b70b-771c02ca75fe` now serves version `58c89646-e7bb-4a34-8746-63b2a88136d1` at 100%. The matching shadow deployment is `a17ab80c-7776-4c7f-8eb6-0e641f55c460`, serving version `531a84ea-6b8b-45b9-8bdb-6767e2f96302`. Both stage plans report `2 to noop`. Google remains unconfigured, and the shadow exists only to characterize the runtime integration. POST auth requests additionally pass through a native `10/60s` per-IP Workers Rate Limiting binding; missing or throwing bindings fail closed, while Cloudflare's documented permissive/eventually-consistent counters remain abuse friction rather than an exact accounting boundary. Live checks on 2026-08-26 confirmed anonymous session lookup (`200 null`), invalid-password rejection (`401`), disabled signup (`400` with no user row written), a complete GitHub OAuth callback with a verified session followed by successful sign-out/session cleanup, security headers, and a subsequent no-op plan.

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
- [`../../site-svelte/e2e/README.md`](../../site-svelte/e2e/README.md)
