# OMG SEO Plan — verified against live site and primary sources

The report table records the Solid production audit from 2026-08-25. The implementation sections now track the Svelte replacement. Re-check production after the whole-host cutover.

## Verification verdicts on the 10 research reports

| Report                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Technical/crawlability | **Confirmed by live fetch.** Canonical defect, soft-404, sitemap non-slash URLs, 307s, conflicting cache-control all reproduce.                                                                                                                                                                                                                                                                                                             |
| 2. Structured data        | **Confirmed by live fetch + repo.** Two JSON-LD blocks exist; the stale one comes from `site/src/entry-server.tsx` (OS "Linux", "22x faster than pacman", url without slash) and is emitted on every page including `/docs/`.                                                                                                                                                                                                               |
| 3. On-page keywords       | **Accepted.** Query clusters are intent-reasoned, not volume-invented; report says so explicitly. Copy recommendations are truthful.                                                                                                                                                                                                                                                                                                        |
| 4. Core Web Vitals        | **Mostly confirmed.** No font preload (verified: 0 `rel=preload`), 17 `modulepreload` (verified), `.webmcp/bridge.js` in head (verified), conflicting asset cache-control (verified: `max-age=0, must-revalidate, public, immutable, max-age=31536000`). CWV thresholds (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 @ p75) are the standard documented values — developers.google.com/search/docs/appearance/core-web-vitals, web.dev/articles/vitals. |
| 5. Social previews        | **Confirmed.** OG set complete on `/` (verified); sub-pages lack OG tags; og:image is a valid 1200×630 PNG.                                                                                                                                                                                                                                                                                                                                 |
| 6. Competitor gap         | **Accepted with caution.** Competitor strategies match their public docs (mise comparison pages, Homebrew formulae). No invented volumes; recommends validating in a keyword tool before heavy investment.                                                                                                                                                                                                                                  |
| 7. Off-page/links         | **Partially rejected.** The channel playbook is sound, but its "current state" section is wrong: it claims the site lacks canonical/OG/sitemap/robots — all verified present. Ignore that section; keep the playbook.                                                                                                                                                                                                                       |
| 8. Search Console         | **Confirmed.** Domain property + DNS TXT verification and Bing CNAME (grey-cloud) match Google/Bing official guidance. Human steps correctly flagged.                                                                                                                                                                                                                                                                                       |
| 9. Docs SEO               | **Accepted.** Findings match live `/docs/` (single page, external GitHub links, brand-only H1s).                                                                                                                                                                                                                                                                                                                                            |
| 10. Long-tail             | **Accepted.** Explicitly marks volumes as estimates; proposals are truthfulness-filtered.                                                                                                                                                                                                                                                                                                                                                   |

Key external citations:

- HowTo removal + FAQ restriction: <https://developers.google.com/search/blog/2023/08/howto-faq-changes>
  (FAQ limited to authoritative gov/health sites Aug 8 2023; HowTo gone from all Search by Sept 13 2023)
- CWV thresholds and page-experience role: <https://developers.google.com/search/docs/appearance/core-web-vitals>

## Implementation plan (sequenced, code-only unless marked 🧑 human)

### Svelte status on 2026-09-01

The Svelte site now owns canonical metadata, crawl directives, and structured data for every public route. Its sitemap emits only canonical URLs. It omits `<priority>` and `<changefreq>` because Google ignores both fields. It also omits `<lastmod>` until the build can supply a consistently accurate content date.

The homepage and documentation page include complete Open Graph and Twitter metadata. The privacy and terms pages now include the same sharing fields. The application icons now match the 192×192 and 512×512 dimensions declared by `manifest.json`.

### Slice 1 — Structured data correctness (P0, complete)

1. [x] Delete the stale global JSON-LD from `site/src/entry-server.tsx`.
2. [x] Keep one truthful `SoftwareApplication` node on the homepage and use the canonical slash URL.
3. [x] Add an `Organization` node and reference it as the publisher.
4. [x] Add `BreadcrumbList` on `/docs/`. Do not add FAQPage or HowTo rich-result markup.

### Slice 2 — Crawlability fixes (P0, complete)

5. [x] Point `/privacy/` and `/terms/` canonicals at their final slash URLs.
6. [x] List only final 200 URLs in the sitemap. Omit advisory fields unless the build can prove them.
7. [x] Return a real 404 page and status for unknown routes.
8. [x] Use permanent redirects for canonical trailing-slash routes.
9. [x] Disallow the API and protected workspace prefixes. Keep route-level `noindex` metadata.

### Slice 3 — Performance (P1, medium)

10. Preload the latin Archivo woff2 (+ mono 400 if above fold) with `crossorigin`.
11. Add a size-adjusted Archivo fallback `@font-face` to kill swap shift.
12. Reduce `modulepreload` set to entry + immediate deps (17 → ~4).
13. Move `.webmcp/bridge.js` out of the critical head path.
14. Fix hashed-asset cache-control to a single `public, max-age=31536000, immutable`
    (HTML stays `max-age=0, must-revalidate`).

### Slice 4 — On-page copy (P1, complete)

15. [x] Name Node.js, Python, Go, Rust, Linux, macOS, and the replaced tools in the homepage description.
16. [x] Use specific package, runtime, and machine setup headings on the homepage.
17. [x] Use specific package, runtime, and reproducible environment headings in the documentation page.
18. [x] Do not publish a `keywords` meta tag.

### Slice 5 — Social previews (P2, complete)

19. [x] Add complete Open Graph and Twitter metadata to `/docs/` and both legal pages.
20. [x] Publish a 1200×630 PNG with its type, dimensions, and alternative text.

### Slice 6 — Docs architecture (P2, medium, later)

21. Render the 8 GitHub `docs/*.md` files as real `/docs/<topic>/` pages (SSG from repo),
    internal links replace GitHub blobs; per-page titles/descriptions; sidebar + breadcrumbs.
22. Comparison page: "Version managers compared: nvm, pyenv, asdf, mise, omg" — factual table only.

### Slice 7 — Off-page (mostly 🧑 human / repo work, not site code)

23. GitHub repo: topics, sharper description, Releases with checksums, community health files.
24. crates.io metadata completeness; AUR `omg`/`omg-bin`; own Homebrew tap first.
25. Coordinated Show HN + Reddit launch window; 2–3 targeted awesome-list PRs after traction.
    (Report 7's wrong "current state" section is excluded.)

### Slice 8 — Measurement (🧑 human dashboard steps)

26. GSC Domain property + DNS TXT at apex (Cloudflare); keep record permanently.
27. Bing Webmaster via GSC import or grey-cloud CNAME; submit sitemap in both.
28. Weekly GSC / monthly Bing review cadence; IndexNow optional later.

## Explicitly rejected / deferred

- FAQPage schema — no visible FAQ content + Google restriction (cited above).
- HowTo as a rich-results strategy — deprecated (cited above); optional plain schema only.
- Chasing head terms like "package manager" — unwinnable.
- Any comparison/speed claim in schema or copy not backed by the reproducible benchmark.
- Keyword-volume-dependent commitments — validate in Semrush/Ahrefs before heavy content spend.
