# OMG SEO plan

The report table records the retired production implementation audited on 2026-08-25. The implementation sections track the SvelteKit website. `https://getomg.xyz` is the new canonical origin. Recheck production after launch and after `omg.latham.cloud` becomes a permanent redirect.

## Verification verdicts on the 10 research reports

| Report                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Technical/crawlability | **Confirmed by live fetch.** Canonical defect, soft-404, sitemap non-slash URLs, 307s, conflicting cache-control all reproduce.                                                                                                                                                                                                                                                                                                             |
| 2. Structured data        | **Confirmed by live fetch + repo.** The retired implementation emitted a stale global JSON-LD block (OS "Linux", "22x faster than pacman", and a non-canonical URL) on every page including `/docs/`.                                                                                                                                                                                                                                       |
| 3. On-page keywords       | **Accepted.** Query clusters are intent-reasoned, not volume-invented; report says so explicitly. Copy recommendations are truthful.                                                                                                                                                                                                                                                                                                        |
| 4. Core Web Vitals        | **Mostly confirmed.** No font preload (verified: 0 `rel=preload`), 17 `modulepreload` (verified), `.webmcp/bridge.js` in head (verified), conflicting asset cache-control (verified: `max-age=0, must-revalidate, public, immutable, max-age=31536000`). CWV thresholds (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 @ p75) are the standard documented values — developers.google.com/search/docs/appearance/core-web-vitals, web.dev/articles/vitals. |
| 5. Social previews        | **Confirmed.** OG set complete on `/` (verified); sub-pages lack OG tags; og:image is a valid 1200×630 PNG.                                                                                                                                                                                                                                                                                                                                 |
| 6. Competitor gap         | **Accepted with caution.** Competitor strategies match their public docs (mise comparison pages, Homebrew formulae). No invented volumes; recommends validating in a keyword tool before heavy investment.                                                                                                                                                                                                                                  |
| 7. Off-page/links         | **Partially rejected.** The channel playbook is sound, but its "current state" section is wrong: it claims the site lacks canonical/OG/sitemap/robots — all verified present. Ignore that section; keep the playbook.                                                                                                                                                                                                                       |
| 8. Search Console         | **Confirmed.** Domain property + DNS TXT verification and Bing CNAME (grey-cloud) match Google/Bing official guidance. Human steps correctly flagged.                                                                                                                                                                                                                                                                                       |
| 9. Docs SEO               | **Accepted.** Findings match live `/docs/` (single page, external GitHub links, brand-only H1s).                                                                                                                                                                                                                                                                                                                                            |
| 10. Long-tail             | **Accepted.** Explicitly marks volumes as estimates; proposals are truthfulness-filtered.                                                                                                                                                                                                                                                                                                                                                   |

Key external sources:

- [Google Search Central, Site moves and migrations](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google Search Central, Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central, HowTo and FAQ changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Google Search Central, Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [Cloudflare Workers, Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## Implementation plan

### Svelte status on 2026-09-04

The website owns canonical metadata, crawl directives, and structured data for every public route. One shared origin contract sets `https://getomg.xyz` across pages, JSON-LD, the sitemap, robots, installers, billing returns, invitations, CORS, and analytics. The sitemap contains only canonical URLs. It omits `<priority>` and `<changefreq>` because Google ignores both fields. It also omits `<lastmod>` until the build can supply accurate content dates.

### Slice 0. Launch the canonical domain

1. [x] Model `getomg.xyz` in `shared/public-site.ts`. Keep deployment hostnames in `site/alchemy.run.ts`, and make source policy enforce their exact values.
2. [x] Configure the production Alchemy Website with `getomg.xyz` as the Custom Domain.
3. [x] Configure `www.getomg.xyz` as an Alchemy-managed HTTP 301 that keeps the path and query string.
4. [x] Replace old-origin URLs in metadata, JSON-LD, sitemap, robots, install commands, Stripe returns, CORS, invitation validation, and analytics.
5. [x] Wait for the `getomg.xyz` Cloudflare zone to become active.
6. [ ] Give the deployment credential `Dynamic URL Redirects Write`.
7. [ ] Launch and observe `getomg.xyz` before changing the old hostname.
8. [ ] Redirect each `omg.latham.cloud` URL to the same path on `getomg.xyz`.
9. [ ] Keep the old-host redirect for at least one year.
10. [ ] Verify both Search Console properties, submit Change of Address, and submit the new sitemap.

The homepage and documentation page include complete Open Graph and Twitter metadata. The privacy and terms pages now include the same sharing fields. The application icons now match the 192×192 and 512×512 dimensions declared by `manifest.json`.

### Slice 1. Structured data correctness

1. [x] Remove the stale global JSON-LD with the retired runtime.
2. [x] Keep one truthful `SoftwareApplication` node on the homepage and use the canonical slash URL.
3. [x] Add an `Organization` node and reference it as the publisher.
4. [x] Add `BreadcrumbList` on `/docs/`. Do not add FAQPage or HowTo rich-result markup.

### Slice 2. Crawlability fixes

5. [x] Point `/privacy/` and `/terms/` canonicals at their final slash URLs.
6. [x] List only final 200 URLs in the sitemap. Omit advisory fields unless the build can prove them.
7. [x] Return a real 404 page and status for unknown routes.
8. [x] Use permanent redirects for canonical trailing-slash routes.
9. [x] Disallow the API and protected workspace prefixes. Keep route-level `noindex` metadata.

### Slice 3. Performance

10. [x] Keep font loading under the generated stylesheet rather than adding manual preloads without measured savings.
11. [x] Keep the current fallback stack; the deployed shadow recorded zero layout shift.
12. [x] Keep SvelteKit's generated module preloads. The deployed shadow transferred 74,188 bytes across 15 scripts and reached a 1,000 ms unthrottled LCP, so overriding framework dependency discovery is not justified.
13. [x] Confirm no `.webmcp/bridge.js` request or reference exists in the Svelte artifact.
14. [x] Confirm hashed scripts and fonts return `public, immutable, max-age=31536000` as one cache policy.

The 2026-09-01 shadow sample used managed Chrome without throttling. It recorded a 549 ms TTFB, 1,000 ms FCP and LCP, zero CLS, 198,205 transferred bytes, and no critical image request. These are deployment diagnostics rather than field Core Web Vitals.

### Slice 4. On-page copy

15. [x] Name Node.js, Python, Go, Rust, Linux, macOS, and the replaced tools in the homepage description.
16. [x] Use specific package, runtime, and machine setup headings on the homepage.
17. [x] Use specific package, runtime, and reproducible environment headings in the documentation page.
18. [x] Do not publish a `keywords` meta tag.

### Slice 5. Social previews

19. [x] Add complete Open Graph and Twitter metadata to `/docs/` and both legal pages.
20. [x] Publish a 1200×630 PNG with its type, dimensions, and alternative text.

### Slice 6. Documentation architecture

21. [x] Publish eight native `/docs/<topic>/` pages with internal links, per-page metadata,
        a sidebar, and breadcrumbs. The Svelte site ships a curated, typed handbook under
        `src/lib/docs` instead of mirroring upstream Markdown. Each topic pins an upstream reference
        file and reviewed commit (`PyRo1121/omg` at `2bb9103`, reviewed 2026-09-03). Pages are static
        route directories prerendered through `src/routes/docs/+layout.ts`. Svelte escapes all
        authored content. There is no raw HTML, Markdown parser, or runtime GitHub request.
        `tools/check-docs-freshness.mjs` keeps registry slugs, content modules, and static route
        directories aligned. With `--clone`, it requires the selected upstream revision to equal the
        reviewed commit. Any CLI code or documentation commit
        therefore requires human review before the provenance pin advances.
22. Comparison page: "Version managers compared: nvm, pyenv, asdf, mise, omg" — factual table only.

### Slice 7. Distribution work

23. GitHub repo: topics, sharper description, Releases with checksums, community health files.
24. crates.io metadata completeness; AUR `omg`/`omg-bin`; own Homebrew tap first.
25. Coordinated Show HN + Reddit launch window; 2–3 targeted awesome-list PRs after traction.
    (Report 7's wrong "current state" section is excluded.)

### Slice 8. Search measurement

26. Add Google Search Console Domain properties for `getomg.xyz` and `omg.latham.cloud`. Keep the DNS verification records.
27. Submit the Search Console Change of Address after the old-host redirects pass.
28. Submit `https://getomg.xyz/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
29. Review Google Search Console each week and Bing each month. Reconsider IndexNow only after the basic reports are stable.

## Explicitly rejected / deferred

- Do not add `FAQPage` schema without visible FAQ content. Google limits FAQ rich results to authoritative government and health sites.
- Do not use `HowTo` as a rich-results strategy. Google removed HowTo rich results.
- Do not chase the generic query `package manager` as the primary target.
- Do not publish comparison or speed claims without a reproducible benchmark.
- Validate keyword-volume claims in a reputable keyword tool before funding a large content program.
