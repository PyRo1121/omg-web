# SEO discovery release — September 14, 2026

## Scope and evidence

Research: [Exa findings and sources](../../exa-results/omg-seo-2026-09-14/research.md).
Implementation: [plan](../superpowers/plans/2026-09-14-seo-discovery.md).

The release retains SvelteKit and the existing Cloudflare Worker. It adds seven
authored guides, three category indexes, consistent metadata and social previews,
dated sitemap entries, shared-source Markdown, and a keyboard-operable mobile menu.
It does not add a framework, runtime dependency, tracking service, or paid plan.

The content distinguishes runtime management from JavaScript dependency management.
The comparison acknowledges overlapping pnpm/mise capabilities. No ranking promise,
invented benchmark, or unsupported native-Windows claim was added. Source review
found and corrected the Node/Bun version-file order and unsafe assumptions about
unpinned PATH selection and Python virtual-environment activation.

## Legacy migration — live

Cloudflare zone: `latham.cloud` (`eca2db53dffce43d6350a177265bb512`).
Ruleset: `331e0b0b23c54496a1ca206e88a7ddb3`, version 1, created
`2026-09-15T01:43:44Z` (September 14 in America/Chicago).
Desired configuration: [legacy-public-redirects.json](legacy-public-redirects.json).

Only `omg.latham.cloud` GET/HEAD requests for `/`, `/docs`, `/docs/`, `/privacy`,
`/privacy/`, `/terms`, and `/terms/` redirect. Targets use HTTPS and canonical trailing
slashes. Query strings are preserved. No previous dynamic-redirect ruleset existed;
the new ruleset did not replace security, rate-limit, or Worker-route configuration.

Live checks confirmed the four public pages and slashless `/docs` redirect in one
301 hop to 200 responses. `/install.sh` remains 200, `/dashboard/` remains 200,
and `/api/health` remains an unredirected 404. This is not an end-to-end validation
of the legacy account application. The old sitemap remains available so its listed
URLs can be recrawled and their permanent redirects discovered.

If rollback is required, disable only the four `omg_public_*` rules in this ruleset.
Do not replace or delete other rules added later. Keep domain registration and TLS
active. Do not forward old API callbacks or installer requests as part of an SEO change.
The configuration uses documented [Cloudflare Single Redirects](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/).

## Search-account actions still needed

Account ownership and actual reports have not been verified. No Search Console or
Bing settings were changed by this release.

1. Confirm access to both old-host and new-domain properties in
   [Google Search Console](https://search.google.com/search-console/). Follow the
   [ownership verification instructions](https://support.google.com/webmasters/answer/9008080)
   using the exact record/value supplied to the owner; do not invent a DNS token.
2. Submit `https://getomg.xyz/sitemap.xml`. Inspect the homepage, Node guide, and
   npm/pnpm guide for crawl access, rendered text, selected canonical, and indexing
   status. Inspect actual reports instead of inferring coverage from `site:` queries.
3. Review eligibility and complete Google's
   [Change of Address workflow](https://support.google.com/webmasters/answer/9370220)
   for the moved public site. Keep redirects active during migration and recrawling.
4. Verify/import the new site in [Bing Webmaster Tools](https://www.bing.com/webmasters/),
   submit the sitemap, and inspect crawl/indexing reports.
5. Review Google's [Search generative AI control](https://support.google.com/webmasters/answer/16908024)
   in the actual property. Preserve the existing separation between search access
   and training restrictions; do not enable training as a side effect of an SEO setting.

## IndexNow — ready to configure, not submitted

`site/tools/indexnow.mjs` submits only explicitly supplied changed public URLs.
It defaults to a no-network preview. `--submit` verifies the live ownership file,
sitemap membership, 200 HTML, self-canonical URL, and absence of noindex before
one POST. It rejects other hosts, private routes, queries, fragments, redirects,
and unpublished pages. A 429 is reported without automatic retry.

Provision an IndexNow key through the intended search account or secure local
generation, host a root UTF-8 `<key>.txt` containing that key, and supply it as
`INDEXNOW_KEY` in the execution environment. Do not paste the value into chat or
command arguments. Publish and verify the key file before submitting. See the
[IndexNow protocol](https://www.indexnow.org/documentation).

From the repository root, preview only the pages changed by a release:

```sh
npm run seo:indexnow --prefix site -- https://getomg.xyz/runtimes/node/ https://getomg.xyz/guides/node-npm-pnpm/
```

After deployment and ownership verification, add `--submit`. A 200 confirms receipt;
202 means ownership validation is pending. Neither proves indexing or ranking.
This bounded notifier handles published additions/updates, not deleted URLs.
Deletion notification and automated diff-to-URL mapping are deferred; do not ping
the entire sitemap on every build. No IndexNow request was sent during this work.

## Measurement and next content decisions

Establish the baseline from real accounts: non-brand clicks and impressions by
query/page, indexing exclusions and selected canonicals, installation-link clicks,
and field Core Web Vitals split by device. Compare equivalent 28-day periods and
record the deployment date. Existing anonymous analytics and privacy-signal handling
remain intact; no new third-party tracker was introduced.

Prioritize new guides from observed queries, support questions, and verified product
capabilities. Go/Rust guides, concrete CI examples, and more comparisons should be
authored and tested individually rather than generated as thin keyword variants.
Validate runtime examples on supported Linux, Apple Silicon macOS, and WSL before
labeling them execution-tested. Review competitor behavior and article dates when
substantively changing content; do not update dates on every deployment.

Paid Workers capacity is not a ranking upgrade. The existing `run_worker_first`
setting is retained because changing it needs a separate security-header, privacy,
404, and cache review. Markdown and `llms.txt` are optional reading surfaces, not
claims of a ranking advantage. No measured CWV or Lighthouse improvement is claimed:
the earlier PageSpeed API request hit its quota.

## Assets and maintenance

The shared image is `site/static/og/omg-discovery-2026.png` (1731 × 909), created with
the built-in image tool and visually checked. Final prompt: preserve the existing
black/orange editorial card and OMG wordmark; headline “Packages & runtimes. One
command.”; subtitle “Node.js, Bun, Python, and system packages. One free CLI.”;
footer “LINUX · APPLE SILICON MACOS · WSL”; retain `getomg.xyz` and `omg env check`.
The older asset remains available for existing externally cached links.

Duplicate public metadata and stale constants were removed. Existing escaped docs
blocks render both handbook and new content. Source reachability/unused-export
checks now recognize SvelteKit 3's `src/params.ts` entry. Git LF checkout policy and
portable clipboard tests prevent Windows-only formatting and newline failures.

## Release status

Legacy redirects are deployed and verified. Website implementation passed local
site tests, public browser checks, type checks, and production packaging before
integration with newer mainline changes. Final integration/deployment results are
recorded below when complete; no search-account or indexing success is implied.
