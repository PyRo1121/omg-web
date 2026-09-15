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

## Search-account follow-up — September 14, 2026

The initial deployment did not change search accounts. A subsequent signed-in
browser check confirmed access to the existing `getomg.xyz` Google domain property.
Its performance, indexing-summary, experience and enhancement reports are still
processing; no traffic baseline is available yet.

- Submitted `https://getomg.xyz/sitemap.xml` to Google. The submission was accepted,
  but the report then showed **Couldn't fetch / Sitemap could not be read**, with
  no detailed HTTP error. This is unresolved, not a successful sitemap crawl.
- Google's homepage inspection says **URL is on Google**, with a successful
  smartphone crawl on September 14 at 12:48:33 PM, crawling/indexing allowed,
  and the inspected URL selected as canonical. A homepage recrawl request was
  accepted into Google's priority queue. This is not proof the new copy is indexed.
- Inspection of the new Node guide returned **Something went wrong**, advising
  retry later. No indexing request for that guide was confirmed.
- Google's manual-actions report says **No issues detected**. Direct retrieval
  of the exact sitemap returned 200 XML with all 24 entries; robots.txt allows
  its crawl. Cloudflare's bot-fight setting is off, and no custom firewall ruleset
  appeared in the zone list. These checks do not establish why Google's fetch
  failed. No security protection was disabled to work around the report.
- Added and verified `https://getomg.xyz/` in the existing Bing Webmaster account
  using DNS, without granting Google-account import permissions. Submitted the
  same sitemap; Bing lists it as **Processing**, not yet crawled/indexed.

Bing verification uses a DNS-only, non-flattened CNAME in the `getomg.xyz` zone:
record ID `d05eaf11d354daf46d95f32b6e51aac6`, created `2026-09-15T02:15:52Z`.
Only the verification hostname was added; apex routing, email and other records
were untouched. Both Cloudflare and Google public DNS resolvers returned the
expected `verify.bing.com` target before Bing verification succeeded. Keep this
record to retain ownership verification. Configuration follows
[Cloudflare's CNAME verification guidance](https://developers.cloudflare.com/dns/manage-dns-records/troubleshooting/cname-domain-verification/).

### Remaining search-account checks

1. Confirm the specific old-host property in
   [Google Search Console](https://search.google.com/search-console/). The new-domain
   property is accessible. Follow the
   [ownership verification instructions](https://support.google.com/webmasters/answer/9008080)
   using the exact record/value supplied to the owner; do not invent a DNS token.
2. Resolve Google's fetch warning for the already submitted sitemap using its
   [sitemap error guidance](https://support.google.com/webmasters/answer/7451001?hl=en).
   Retry Node and npm/pnpm guide inspection when the inspection service is available.
   Check crawl access, rendered text, selected canonical and indexing status. The
   homepage request is already queued; do not repeatedly submit it.
3. Review eligibility and complete Google's
   [Change of Address workflow](https://support.google.com/webmasters/answer/9370220)
   for the moved public site. Keep redirects active during migration and recrawling.
4. Check the submitted sitemap and crawl/indexing reports in
   [Bing Webmaster Tools](https://www.bing.com/webmasters/). Ownership is now verified;
   processing and discovery are not yet confirmed.
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
The npm audit runner now invokes npm's supplied CLI path through Node rather than
trying to execute a Windows `.cmd` file as a native binary. A deterministic browser
test catches a menu opened before hydration; the native details state is preserved.

## Release status

Both the legacy redirects and the website are deployed and verified. Search-account
follow-up is recorded above; deployment does not imply ranking or traffic improvement.

- Integrated current `origin/main` at `1007065` before deploying, preserving the
  newer security status, anonymous-auth guard, and dependency fixes.
- Website source commit: `50725b2` on `codex/seo-discovery-cleanup`. Source is
  committed locally; this branch has not been pushed or merged into remote main.
- Production Worker: `omgsveltesite-website-prod-dlaqgfttmir2ky5x`.
- Final deployed version: `33860af4-3f4e-4768-ae29-d87c00926bd8`.
- Pre-release version: `b7ce3b15-40c7-4dfd-8aed-4c338fe5f32b`. Rollback restores
  old website content, not Cloudflare redirect rules or database state.
- `DEPLOYMENT_STAGE=prod`, the existing D1/service/rate-limit bindings and secrets
  were preserved. The deployment made no API Worker, database migration, subscription,
  or DNS change. The later Bing verification-only DNS addition is recorded above.
- Live browser discovery suite: 4/4 passed. Local public suite: 20 passed, with
  3 deployment-only authentication tests intentionally skipped in the local run.
- Live sitemap: 24 HTML URLs, all 200, each with one H1, a matching canonical,
  and no response-level noindex. New guide metadata, client navigation, mobile
  keyboard/no-JavaScript behavior, missing-route 404s and text endpoints passed.
- `/health`, `/login/`, `/install.sh` return 200; anonymous `/dashboard/` and
  `/admin/` return 302 to `/login/`. No account login or payment was performed.
- 331 site tests and 312 API tests passed. Type checks, lint, formatting,
  source-policy, unused-export, migration-integrity, lockfile-integrity and all
  three npm vulnerability audits passed. No new runtime dependencies.
- Production build and Wrangler dry-run passed. Landing JavaScript closure:
  71,225 gzip bytes; 170,730 gzip bytes across all 66 chunks, within existing budgets.

### Edge-delivery findings fixed during verification

The first deployment exposed a cached old sitemap. Purged only
`https://getomg.xyz/sitemap.xml` in zone `fb74005c3f17bc04cff822a8117643ea`, then
verified the ordinary, query-free URL lists all 24 pages. Repeat this targeted
purge after future sitemap changes; deploying a Worker does not invalidate every
independently cached response.

The adapter discarded custom headers for prerendered text endpoints. Markdown and
`llms.txt` now run through their response handlers, retaining explicit MIME types,
noindex and `search=yes, ai-train=no`. Public guide HTML remains prerendered.
Markdown links may normalize their trailing slash through the endpoint router;
the final response and policy are covered by live tests.

### Remaining repository-wide check limitations

The umbrella `npm run check` is **not green on this Windows host**. Its installer
suite initially resolves the WSL launcher without an installed distribution; the
explicit Git Bash run also does not complete its platform-specific cases. The
vendored anti-slop manifest check rejects a CRLF line, and the historical audit
evidence checker reports path/hash differences on Windows. No evidence file or
stored security hash was altered to suppress these failures. Validate those gates
on the existing Linux CI runner before merging. These limitations are separate
from the successful website/API tests and live SEO checks above.

Existing adapter-deprecation and Better Auth ignored-side-effect-import warnings
remain visible. Resolving them requires upstream compatibility work, not deleting
security imports or changing dependencies solely to silence a warning.

### Follow-up repository verification

Fresh `npm test` on the continuation passed all 643 tests (331 site, 312 API).
`git fetch origin` found no new main commits to integrate; this branch contains
`origin/main` at `1007065`. That main commit's existing
[Linux CI run](https://github.com/PyRo1121/omg-web/actions/runs/34906294691)
passed, but it does **not** validate this SEO branch. This branch is still local;
publishing it for a PR or a manually dispatched branch run is the next integration
decision. No remote merge or CI-success claim for this branch has been made.
