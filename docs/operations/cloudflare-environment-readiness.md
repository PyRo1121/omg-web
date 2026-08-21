# Cloudflare environment readiness

**Last read-only inventory:** 2026-08-21

**Deployment status:** blocked

This document records the production resources required by the repository and the procedure for verifying them. It does not authorize creating, replacing, migrating, or deleting remote resources.

## Required topology

| Kind            | Required resource                                        | Repository authority                             |
| --------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Worker          | `omg-saas`                                               | `site/workers/wrangler.toml`                     |
| Worker          | `omg-router`                                             | `workers/router/wrangler.toml`                   |
| Worker          | `omg-releases`                                           | `workers/releases/wrangler.toml`                 |
| Pages project   | `omg-site`                                               | `site/wrangler.toml` and the site build pipeline |
| D1              | `omg-licensing` / `bcaf7781-a747-4637-92d9-94782e4fa1db` | `site/workers/wrangler.toml`                     |
| D1              | `omg-auth-db` / `871b70ca-79f7-4bb0-bfba-0f9f9aca4de9`   | `site/wrangler.toml`                             |
| D1              | `omg-analytics` / `e11296b5-1c01-437a-9d22-2e3786c20932` | `workers/releases/wrangler.toml`                 |
| R2              | `omg-assets`                                             | `site/workers/wrangler.toml`                     |
| R2              | `omg-releases`                                           | `workers/releases/wrangler.toml`                 |
| R2              | `omg-releases-preview`                                   | `workers/releases/wrangler.toml`                 |
| Service binding | site `LICENSING_API` → `omg-saas`                        | `site/wrangler.toml`                             |

The externally hosted `omg-docs.pages.dev` project is not treated as an owned resource until its source repository and Cloudflare account ownership are established.

## Inventory result

The 2026-08-21 inventory used Wrangler 4.125.0 and the authenticated `PyRo1121` account. It made only list/get requests.

- The account contained no `omg-*` Workers.
- `wrangler pages project list --json` returned no Pages projects.
- All three configured D1 UUIDs returned Cloudflare error `7404` (database not found).
- The account contained only the unrelated `tcg-vault-images` R2 bucket.
- Both checked production R2 buckets returned Cloudflare error `10006` (bucket does not exist).
- Contemporaneous DNS resolution failed for `pyro1121.com`, `api.pyro1121.com`, `releases.pyro1121.com`, `omg-site-4gd.pages.dev`, and `omg-docs.pages.dev`. Search indexes still contain historical page snapshots, but those are not evidence of a live deployment.

Therefore a successful local dry run proves only that bundles and configuration syntax are valid. It does **not** prove that the configured remote resources or service bindings exist.

## Repeat the read-only gate

Authenticate Wrangler to the intended production account, then run:

```bash
npm run check:cloudflare:remote
```

The command performs only read operations and exits nonzero if any required Worker, Pages project, D1 database UUID, or R2 bucket is absent or inaccessible. It is intentionally excluded from the default CI gate because CI does not receive production Cloudflare credentials.

## Recovery decision before provisioning

Do not create empty replacements under the existing names until ownership and recovery have been decided. The configured UUIDs may refer to deleted resources, another Cloudflare account, or historical production data that must be restored.

The owner must explicitly choose one path:

1. **Recover existing production:** locate the prior account, database exports/backups, Worker deployment history, R2 artifacts, DNS routes, Pages project, and secrets.
2. **Provision a new empty production environment:** accept that no historical production state is being recovered, create new resources, update every generated identifier in version control, and apply migrations through the normal reviewed deployment process.

Use a separate staging environment first. Staging must have isolated D1 databases, R2 buckets, OAuth credentials, Better Auth secrets, Stripe test-mode resources, and routes. Never point mutation-enabled browser characterization at production.

## Required validation after recovery or provisioning

1. Run `npm run check:cloudflare:remote` until every resource is accessible.
2. Inventory `d1_migrations` and `sqlite_schema` before applying any D1 migration.
3. For a genuinely empty `omg-licensing` database, apply the immutable migration sequence in `site/workers/migrations/`; do not rewrite it.
4. Confirm the site database contains only Better Auth identity/session data and no mutable licensing mirror.
5. Configure the private `LICENSING_API` service binding for production and preview.
6. Configure server-only secrets through Cloudflare; never commit secret values or copy them into client-visible variables.
7. Verify custom-domain routes and DNS ownership for `pyro1121.com`, `api.pyro1121.com`, and `releases.pyro1121.com`.
8. Verify Stripe products, allowlisted prices, webhook destination/signing secret, and sandbox separation.
9. Run authenticated staging Playwright characterization before production cutover.
10. Deploy through the reviewed pipeline, inspect Workers observability, and retain a tested rollback target.

See also:

- [`observability.md`](./observability.md)
- [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md)
- [`../../site/e2e/README.md`](../../site/e2e/README.md)
