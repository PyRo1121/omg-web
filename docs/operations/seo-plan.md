# OMG SEO Plan — verified against live site and primary sources

Every claim below was either re-verified against the live site (`curl`, 2026-08-25) or checked
against Google's official documentation. Agent reports with unverified or wrong claims are marked.

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

### Slice 1 — Structured data correctness (P0, small)

1. Delete the stale global JSON-LD from `site/src/entry-server.tsx`.
2. Keep exactly one `SoftwareApplication` per page (homepage route already has the truthful one);
   drop the "22x faster" superlative from schema (it stays as measured context in the visible
   benchmarks section), normalize `url` to trailing slash.
3. Add `Organization` node (`@id …/#org`, logo, `sameAs` GitHub) referenced as `publisher`.
4. Add `BreadcrumbList` on `/docs/` (Home → Docs). No FAQPage (no visible FAQ; restricted anyway).
   No HowTo as a rich-results play (deprecated); optional later as plain schema.

### Slice 2 — Crawlability fixes (P0, small)

5. Canonicals on `/privacy/` and `/terms/` must point at the slash URLs that return 200.
6. Sitemap lists final 200 URLs (`/docs/`, `/privacy/`, `/terms/`); add `<lastmod>`.
7. Unknown routes return a real 404 page + status instead of the 200 SPA shell.
8. Trailing-slash redirects 307 → 301/308 where we control them.
9. robots.txt: add `Disallow: /dashboard` and `/admin` (keep meta noindex too).

### Slice 3 — Performance (P1, medium)

10. Preload the latin Archivo woff2 (+ mono 400 if above fold) with `crossorigin`.
11. Add a size-adjusted Archivo fallback `@font-face` to kill swap shift.
12. Reduce `modulepreload` set to entry + immediate deps (17 → ~4).
13. Move `.webmcp/bridge.js` out of the critical head path.
14. Fix hashed-asset cache-control to a single `public, max-age=31536000, immutable`
    (HTML stays `max-age=0, must-revalidate`).

### Slice 4 — On-page copy (P1, small, truthful)

15. Meta description: include literal phrases — "Node.js, Python, Go, Rust", "Linux and macOS",
    "alternative to nvm, pyenv, rustup, and Homebrew".
16. Workflow H3s become query-bearing: "Install Node.js, Python, or Rust — no nvm or pyenv needed",
    etc. Keep voice; no keyword stuffing.
17. Docs H2s: "Runtimes" → "Manage Node.js, Python, and Rust versions", etc.
18. Remove the unused `keywords` meta tag.

### Slice 5 — Social previews (P2, small)

19. Full OG/Twitter set on `/docs/` (and legal pages) — currently only `/` has them.
20. Add `og:image:type`, sharpen `og:image:alt`, long cache for `/og/*`.

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
