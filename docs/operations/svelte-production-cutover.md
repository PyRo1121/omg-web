# Launch the SvelteKit website on `getomg.xyz`

- **Status:** local candidate verification in progress
- **Canonical hostname:** `getomg.xyz`
- **Redirect hostnames:** `www.getomg.xyz`, then `omg.latham.cloud`
- **Target Worker:** `omgsveltesite-website-prod-dlaqgfttmir2ky5x`
- **Rollback Worker:** `omg-site`

## Keep ownership separate

- Alchemy owns the SvelteKit Worker, its bindings, its secrets, its observability settings, and its website domains.
- Wrangler owns `omg-saas` and the `omg-platform` D1 migrations.
- `getomg.xyz` serves the complete website. Do not split paths between Workers.
- `www.getomg.xyz` returns a path-preserving HTTP 301 before the Worker runs.
- Keep `omg.latham.cloud` on `omg-site` until the new domain passes the observation period.
- The SvelteKit Worker keeps its Alchemy-managed auth secret. Existing sessions on `omg.latham.cloud` do not move to `getomg.xyz`.
- Stop for approval before each production deploy, domain attachment, domain detachment, OAuth application change, or Worker deletion.

## Topology before launch

| Resource                  | Owner                                                            | Public routing                         |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| SvelteKit website         | `site/alchemy.run.ts`                                            | Production Worker has no public domain |
| Rollback website          | `omg-site`                                                       | `omg.latham.cloud` Custom Domain       |
| Licensing and billing API | `workers/api/wrangler.toml`                                      | `omg-api.latham.cloud` Custom Domain   |
| Shared data               | D1 `omg-platform` with ID `fee8ddab-fb4a-4be4-b8d2-8abb7c2db188` | Private bindings and the API Worker    |

Do not import `omg-site`, `omg-saas`, or D1 into Alchemy state.

## Meet every launch gate

Before the first production write:

1. Push the candidate commit and obtain a green GitHub Actions run.
2. Run `npm run check` from the repository root.
3. Run `npm run test:e2e:public` from `site/`.
4. Deploy the same commit to the `shadow` stage and pass the external Playwright suite.
5. Run `npm run plan --prefix site -- --stage prod`.
6. Confirm that the plan adds only `getomg.xyz`, the `www.getomg.xyz` redirect, and the expected website update.
7. Run `npm run check:cloudflare:remote`.
8. Confirm that Cloudflare owns an active `getomg.xyz` zone and that neither launch hostname has a conflicting CNAME or Custom Domain.
9. Confirm that the Cloudflare credential can manage Workers, Custom Domains, DNS, certificates, and dynamic redirect rules.
10. Pass the focused authentication, billing, account, organization, and operator tests.
11. Create or configure a GitHub OAuth application with this callback URL:

```text
https://getomg.xyz/api/auth/callback/github
```

12. Load that application's client ID and secret into the production Alchemy environment. Keep the old OAuth application unchanged until rollback ends.

Record unavailable live credentials as unverified evidence. A skipped test is not a pass.

## Launch the new domain

### 1. Refresh the shadow deployment

Deploy the reviewed commit:

```bash
npm run deploy --prefix site -- --stage shadow --yes
```

Run the external public suite against the emitted URL. Run the authenticated suites when credentials exist.

### 2. Review the production plan

The production Website resource must contain this domain policy:

```ts
domain: {
  name: 'getomg.xyz',
  redirects: ['www.getomg.xyz'],
}
```

Alchemy infers the zone for each hostname. It creates the Custom Domain DNS record and certificate. It also creates a Cloudflare dynamic redirect rule for `www.getomg.xyz`. The redirect returns HTTP 301 and preserves the path and query string.

Do not add `omg.latham.cloud` yet. Its Custom Domain still belongs to `omg-site`.

### 3. Deploy the website

After approval, deploy the production Website resource:

```bash
npm run deploy --prefix site -- --stage prod --yes
```

Verify these requests before changing the API Worker:

- `GET https://getomg.xyz/health` returns `runtime: sveltekit-alchemy`.
- The home, docs, privacy, terms, login, and signup pages return the expected status.
- `GET https://www.getomg.xyz/docs/cli/?runtime=node` returns HTTP 301 to `https://getomg.xyz/docs/cli/?runtime=node`.
- Canonical, Open Graph, JSON-LD, sitemap, and robots URLs use `https://getomg.xyz`.
- Unknown routes return a real 404.
- Protected routes redirect to login.
- Installer files and the public verification key match their committed hashes.

### 4. Deploy the API origin change

The API commit changes Stripe return URLs, CORS, invitation URL validation, and the analytics hash domain to `getomg.xyz`.

After approval, deploy `omg-saas` with its existing Wrangler workflow. Do not run D1 migrations.

Verify GitHub statistics, checkout creation, the billing portal return URL, organization invitation delivery, and the Service Binding paths from the new domain.

### 5. Observe the canonical site

Observe production for at least 15 minutes. Check at launch and every five minutes:

- `/health`, public pages, login, and protected redirects remain correct.
- Authentication, dashboard, billing, organization, and operator authorization remain correct.
- Worker logs show no sustained increase in exceptions or 5xx responses.
- The sitemap contains only canonical public URLs.
- The `www` redirect keeps the full path and query string.

If a gate fails, remove the `getomg.xyz` domain policy or roll back the Svelte Worker version. Keep `omg.latham.cloud` on `omg-site` while investigating.

## Redirect the old hostname

Google recommends a direct permanent redirect for every old URL and asks site owners to keep redirects for at least one year. The redirect must keep each path instead of sending every request to the home page.

After the new domain passes observation:

1. Add `omg.latham.cloud` to `domain.redirects` in `site/alchemy.run.ts`.
2. Review the Alchemy production plan.
3. Stop for approval.
4. Detach the `omg.latham.cloud` Custom Domain from `omg-site`.
5. Deploy the Alchemy plan at once.
6. Confirm that representative old paths return HTTP 301 to the same path on `getomg.xyz`.
7. Confirm that query strings survive the redirect.
8. Verify DNS, TLS, sitemap, canonical tags, authentication, and billing again.

The detach and attach cannot overlap because one Custom Domain cannot belong to two Workers.

## Retire the old Worker

After the old-host redirect passes production checks:

1. Confirm that `omg-site` has no route or Custom Domain.
2. Stop for approval.
3. Delete `omg-site`.
4. Run the remote resource check and the production Playwright suite.
5. Record the commit, CI run, deployment result, redirect checks, and observation timestamps in this document.

Keep the `omg.latham.cloud` redirect for at least one year. Keep it indefinitely if its operating cost remains negligible.

## Complete search-engine migration

After launch:

1. Verify both hostname properties in Google Search Console.
2. Submit the Change of Address from `omg.latham.cloud` to `getomg.xyz`.
3. Submit `https://getomg.xyz/sitemap.xml`.
4. Update high-value external links, package metadata, profiles, and release notes to use `getomg.xyz`.
5. Monitor indexed pages, crawl errors, and search traffic on both properties.

Google documents temporary ranking changes during a domain move. Do not combine this launch with another URL or page-layout migration.

## Sources

- [Google Search Central, Site moves and migrations](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google Search Central, Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Cloudflare Workers, Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- `alchemy@2.0.0-beta.74`, `WorkerDomainConfig` in `site/node_modules/alchemy/src/Cloudflare/Workers/Worker.ts`
