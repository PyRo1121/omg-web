# Cloudflare environment readiness

- **Reviewed:** 2026-09-04
- **Account:** `PyRo1121` with ID `f1e95b3e1b502cf366dfc81a863695fa`
- **Status:** `getomg.xyz` is active on Cloudflare. The SvelteKit production Worker has no public domain.

## Resource inventory

| Resource                  | Name                                                    | Configuration authority                | Public address                                                             |
| ------------------------- | ------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Website production Worker | `omgsveltesite-website-prod-dlaqgfttmir2ky5x`           | `site/alchemy.run.ts`                  | Detached                                                                   |
| Website shadow Worker     | `omgsveltesite-website-shadow-bfrqe2m2mfps2gu6`         | `site/alchemy.run.ts`                  | `https://omgsveltesite-website-shadow-bfrqe2m2mfps2gu6.latham.workers.dev` |
| Canonical website zone    | `getomg.xyz` with ID `fb74005c3f17bc04cff822a8117643ea` | Cloudflare DNS                         | Active on `lila.ns.cloudflare.com` and `piotr.ns.cloudflare.com`           |
| Rollback website Worker   | `omg-site`                                              | Retained Cloudflare deployment         | `https://omg.latham.cloud`                                                 |
| API Worker                | `omg-saas`                                              | `workers/api/wrangler.toml`            | `https://omg-api.latham.cloud`                                             |
| Platform database         | `omg-platform`                                          | `workers/api/wrangler.toml` migrations | Private D1 binding                                                         |

The stable D1 identifier is `fee8ddab-fb4a-4be4-b8d2-8abb7c2db188`.

## Ownership rules

- Alchemy owns the SvelteKit Worker, its generated auth secret, rate-limit bindings, service and D1 bindings, assets, and observability configuration.
- Wrangler owns `omg-saas`, its public domain, and the canonical migration chain under `workers/api/migrations/`.
- Alchemy binds the existing D1 database by identifier. It must not adopt, migrate, replace, or delete D1.
- Do not use `--adopt` for `omg-site`, `omg-saas`, or D1.
- Production has `workers.dev` disabled. Shadow is the only stable public `workers.dev` surface.

## Credential scope

The current Wrangler OAuth profile can read the account and zones. It can write Workers, Worker routes, and SSL certificates. It does not list the `Dynamic URL Redirects Write` permission that Cloudflare requires for the Rulesets API.

The Alchemy production plan can read the pending zone, but do not deploy the redirect policy until the active credential has `Dynamic URL Redirects Write`. Use a scoped token or an approved OAuth grant. Do not print or copy either credential.

## Local environment contract

`site/alchemy.environment.mjs` is the only supported wrapper for Alchemy commands. It loads the local Alchemy environment without printing values, accepts only `shadow` and `prod`, and rejects non-interactive deployment without `--yes`.

```bash
npm run plan --prefix site -- --stage shadow
npm run plan --prefix site -- --stage prod
npm run deploy --prefix site -- --stage shadow --yes
npm run deploy --prefix site -- --stage prod --yes
```

Do not create `site/.env` from remote secret values. Local files are for developer-owned configuration only and remain ignored.

## Verification gates

Run from the repository root:

```bash
npm run check:cloudflare:remote
npm run check
```

Run from `site/`:

```bash
npm run test:e2e:public
npm run plan -- --stage shadow
npm run plan -- --stage prod
```

A production plan for the initial launch must update only the Website and leave `ShadowAuthSecret` unchanged. The Website change must add `getomg.xyz` and the `www.getomg.xyz` redirect. A secret replacement stops the deployment because it would invalidate sessions.

The shadow deployment must return `runtime: sveltekit-alchemy` from `/health`, apply `noindex, nofollow`, and pass the external browser suite. Production must not emit the shadow robots header.

## Deployment rollback

- Before domain attachment, roll back the target Worker version.
- During `getomg.xyz` observation, remove the new domain policy or roll back the target Worker version. `omg.latham.cloud` remains on `omg-site`.
- After the old hostname becomes a redirect, roll back the Svelte Worker version. Reattach `omg.latham.cloud` to `omg-site` only if the known-good Svelte Worker cannot be restored.

See [`svelte-production-cutover.md`](./svelte-production-cutover.md) for the ordered traffic procedure and [`svelte-auth-cutover.md`](./svelte-auth-cutover.md) for session behavior.
