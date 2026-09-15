# OMG: SEO and discovery upgrade plan
Reviewed September 14, 2026 (America/Chicago).

## Decision

Prioritize the unfinished domain migration, search measurement, and practical developer documentation. Keep the current SvelteKit/Cloudflare architecture and visual identity. Paid infrastructure is a capacity decision; the evidence does not establish a need to buy it for SEO.

The proposed goal is qualified organic visits that become successful OMG users. No one can guarantee first place for every runtime query. Queries such as “npm” often express a desire for that project's official site. Start with specific installation, version-switching, migration, and environment problems where OMG can give a complete answer. Google explains the limits of ranking guarantees in its [SEO guidance](https://developers.google.com/search/docs/fundamentals/do-i-need-seo).

This is a research and review deliverable. No website behavior, deployment, Cloudflare setting, search property, or subscription was changed.

## Evidence and limitations

Research used 15 Exa searches across four workstreams: technical SEO; AI search and freshness; developer-tool competitors; performance and Cloudflare. Searches returned 75 entries and 74 exact unique URLs. Localized mirrors, alternate formats, and overlapping vendor pages are not independent corroboration. Secondary SEO commentary was excluded from the technical recommendations. Eleven selected pages were also fetched for fuller review. The accompanying sources.json preserves the search inventory.

The live audit requested all 14 sitemap URLs, the old homepage and docs page, HTTP/www variants, a slash redirect, a nonexistent URL, and representative assets. It examined raw HTML, metadata, JSON-LD syntax, HTTP headers, Cloudflare zone settings and DNS, plus desktop and mobile homepage rendering. Repository files supplied implementation context.

Unavailable: authenticated Search Console/Bing reports, keyword volumes, backlink measurements, and real-user Core Web Vitals. The PageSpeed API returned HTTP 429 for its quota, and a performance trace tool was unavailable. There is no verified Lighthouse score or field-performance score in this report. Search-engine queries alone cannot establish whether the whole site is indexed.

## 1. Fix the domain migration first

| Live check | Result | Interpretation |
| --- | --- | --- |
| https://getomg.xyz/ | 200; canonical points to itself | Correct new homepage |
| https://omg.latham.cloud/ | 200; indexable; canonical points to old domain | Migration remains incomplete |
| https://omg.latham.cloud/docs/ | 200; indexable; old-domain canonical | Same defect on docs |
| http://getomg.xyz/ | 301 to HTTPS | Correct |
| https://www.getomg.xyz/ | 301 to apex | Correct |
| https://getomg.xyz/docs | 308 to /docs/ | Correct |
| Deliberately nonexistent path | 404 and noindex | Correct error handling |

The old domain still publishes an older version of OMG and claims it is canonical. This gives crawlers conflicting preferred locations and can divide discovery/link signals. The exact ranking impact cannot be measured without search reports.

**Proposed change:** Map old public pages to their equivalent new pages with one permanent 301/308 redirect. Preserve relevant paths and query strings; avoid sending unrelated removed pages to the homepage. Audit old API, authentication, installer, and download consumers separately before applying a broad rule. Scope changes specifically to the OMG hostname, not all of latham.cloud.

Verify ownership of old and new properties, then submit Change of Address where applicable and the new sitemap. Update the GitHub repository homepage, README links, release templates, and other controlled links to the canonical domain. Keep redirects for at least a year and preferably indefinitely while old links exist. These steps follow [Google's migration guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) and [Change of Address requirements](https://support.google.com/webmasters/answer/9370220).

**Acceptance:** Old public URLs resolve in one permanent hop to the equivalent 200 page. New HTML, social tags, JSON-LD, sitemap entries, and controlled external links agree on getomg.xyz.

## 2. Preserve the SEO settings that already work

All 14 sitemap pages returned 200 with their own canonical URLs and unique titles. They each had one H1 and a description. Public content and links were present in the initial HTML. The homepage had parseable Organization/WebSite/SoftwareApplication JSON-LD; docs had parseable breadcrumbs. Syntax checks do not establish rich-result eligibility.

The [live robots file](https://getomg.xyz/robots.txt) allows ordinary public crawling, points at the sitemap, and excludes API/dashboard/admin paths. Sitemap noindex applies to the XML resource itself; it does not mark its listed HTML pages noindex.

Cloudflare settings inspected: HTTPS enforcement, Brotli, HTTP/2, HTTP/3, and Early Hints enabled; Rocket Loader disabled. A fingerprinted stylesheet returned a one-year immutable cache policy. Docs returned cache hits on repeat requests.

Keep server/prerendered public content and real anchor links. These align with [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) and [internal-link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable). No framework replacement is justified by this audit.

**Targeted improvements:**

- Centralize shared metadata defaults so new routes cannot silently omit canonical, description, social tags, or indexing policy.
- Add social preview images and Twitter cards to /updates/ and /security/, which currently lack them.
- Refresh the shared image and its description to match the current homepage. Existing metadata still describes an orange “7→1” graphic from an older design.
- Add accurate sitemap lastmod dates derived from substantive content changes, not every deployment. Bing explicitly recommends truthful freshness information in [its sitemap guidance](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search).
- Validate supported structured data with Google's Rich Results Test. Use only properties supported by visible content; do not invent reviews or ratings.
- Add a small public-route release check: HTTP status, one canonical, expected indexing policy, title/description, valid JSON-LD syntax, sitemap coverage, and broken internal links.

## 3. Build pages for real developer tasks

The homepage's visible content contains no npm, pnpm, or Bun mentions. It leads with “Your machine. One command.” The sitemap has 14 pages, including eight handbook topics; runtime coverage is concentrated in one general page. None of the audited public pages mentions pnpm.

Keyword occurrence is not itself a ranking formula. The useful finding is that a visitor cannot find a complete npm/pnpm workflow or a dedicated Bun guide on this site.

### Proposed first publishing batch

These are editorial targets, not measured search-volume estimates. Paths are proposals.

| Proposed page | Developer need | Required original value |
| --- | --- | --- |
| /runtimes/node/ | Install/switch Node.js; keep npm working | Tested setup, version files, shell behavior, npm verification, troubleshooting |
| /runtimes/bun/ | Install and pin Bun versions | Version switching, .bun-version behavior, coexistence with Node |
| /runtimes/python/ | Manage Python per project | Tested installation, virtual environments, project pins, limitations |
| /guides/node-npm-pnpm/ | Use npm/pnpm with an OMG-managed runtime | Explain ownership of runtime vs dependencies; reproduce install/build workflows |
| /guides/migrate-from-nvm/ | Move an existing .nvmrc project to OMG | Before/after steps, PATH conflicts, reversible migration, no fabricated auto-migration |
| /compare/omg-vs-mise/ | Decide between two multi-tool managers | Current feature/support matrix, tested commands, dates, tradeoffs |
| /guides/reproducible-dev-environments/ | Onboard another developer or run CI consistently | Working example repository and evidence of what capture/check/sync actually reproduces |

Ship fewer pages if verification is incomplete. Later add Go/Rust/Deno guides and asdf/Volta comparisons when they offer distinct value. Keep the current /docs/ pages as references and link guides to them contextually. Avoid multiple near-identical pages competing for the same task.

Each substantive guide should include prerequisites, supported platforms, working commands and expected results, common failures, limitations, author/reviewer, last verified date, relevant sources, and a next action. A short real demo with a transcript is useful where it makes the task clearer. Do not manufacture a word-count requirement.

### Positioning and competitor lessons

- [mise's Node guide](https://mise.jdx.dev/lang/node.html) covers npm pinning, version-file compatibility, and configuration details on a dedicated page.
- [mise's asdf comparison](https://mise.jdx.dev/dev-tools/comparison-to-asdf.html) addresses migration and tradeoffs. Its self-comparative speed/security claims are vendor claims, not independent evidence.
- [Volta](https://docs.volta.sh/guide/understanding) explains per-project behavior and package binaries concretely.
- [Bun's package-manager page](https://bun.com/package-manager) separates package installation from its runtime and exposes benchmark conditions. Its performance numbers were not independently reproduced here.
- Current [pnpm runtime documentation](https://pnpm.io/cli/runtime) already covers Node, Deno, and Bun management, while [package.json documentation](https://pnpm.io/package_json) covers runtime locking. Any comparison that says pnpm cannot manage runtimes would be inaccurate.

npm/pnpm are primarily dependency-management tools; Bun includes both a runtime and package manager. Features overlap. Explain exactly what OMG manages, what remains handled by npm/pnpm/Bun, and how they work together.

OMG's promising differentiation is the combination of native system packages, language runtimes, and environment workflows. Validate that advantage against current competitors. The existing pacman search benchmark supports a package-search claim; it cannot substantiate faster npm dependency installation or faster JavaScript execution.

## 4. Improve the homepage and mobile journey

The current black/orange identity is distinctive and the tested mobile homepage showed no horizontal overflow. Preserve it.

The main opportunity is clarity:

- Proposed title: **OMG — Package & Runtime Manager for Linux and macOS**.
- Proposed main heading: **Manage packages and language runtimes with one CLI.**
- Put supported runtimes and Linux/macOS/WSL limitations near the introduction.
- Show a real progression: install a system package, select a runtime, check an environment. Keep the current install CTA and add clear links to each runtime guide.
- Add a compact “Works with your project” section for version files and dependency tools, limited to verified behavior.
- Keep benchmarks reproducible and attach each claim to the operation measured.
- Provide a mobile menu with Docs, Runtimes, Guides, and Comparisons. The current header hides its main navigation below 48rem with no replacement menu.
- Add brief maintainer/project information and link to releases and source. Use real adoption evidence if available.

Existing analytics code already handles referrer/UTM information and several CTA categories. Extend and verify that system rather than installing redundant trackers. Distinguish clicking Install, copying an installer command, downloading a binary, and successfully using OMG; they are different outcomes. Do not equate visits or copy events with installations.

## 5. Add measurable AI-search support

### High-confidence work

1. Check Google's **Search generative AI control** in Search Console. Official documentation now describes inclusion/exclusion/inheritance; inclusion is the default, but OMG's actual setting was not inspected. See [the control documentation](https://support.google.com/webmasters/answer/16908024).
2. Include Google's generative-AI performance report in measurement where available, alongside ordinary Search performance. See [Google's current optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
3. Preserve access for OAI-SearchBot. OMG's current robots file does not explicitly block it. GPTBot is blocked, but that is a separate training preference, not a ChatGPT search opt-out. Verify actual crawler access using provider verification/IP guidance and logs, not merely a spoofed User-Agent. See [OpenAI's crawler documentation](https://developers.openai.com/api/docs/bots).
4. Verify Bing Webmaster Tools, submit the sitemap, and use [Bing AI Performance](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview) to measure citations, cited URLs, and grounding queries. Citation counts are not ranking positions.
5. Add a deploy-triggered IndexNow notification for genuinely added/changed/deleted public URLs. Use the [protocol](https://www.indexnow.org/documentation.html); do not describe submission as guaranteed indexing or a Google ranking boost.

### Optional experiment: documentation for coding agents

Generate Markdown docs and an llms.txt index from the same reviewed content model. This could make OMG easier for coding agents to learn and use. Treat it as developer distribution/usability work with measurable referral/adoption goals.

Google explicitly says it does not require or specially use llms.txt, Markdown, or special AI schema for search inclusion. Clear, substantive, original HTML content remains the priority. It also discourages creating pages for every possible query variation. See [Google's guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

Cloudflare's [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) is another option, currently available on Pro/Business/Enterprise website plans. Workers Paid is a separate subscription and does not by itself establish entitlement to that feature. A static Markdown export avoids buying a website plan solely for conversion.

If using content negotiation, separate HTML/Markdown cache variants correctly and preserve access/cache controls. Cloudflare's documented default Content-Signal permits training unless overridden, while OMG currently expresses ai-train=no in robots. Preserve the site's chosen policy deliberately; do not enable conversion without addressing that mismatch.

## 6. Cloudflare spending and performance

The zone is on Cloudflare Free Website. The account's Workers subscription was not independently checked.

Workers Paid currently starts at **$5/month**, with usage charges beyond included allowances. Direct static-asset requests are free, while Worker invocations are billed. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

The checked-in production configuration sets assets.run_worker_first=true. If that configuration is deployed, static requests also invoke the Worker and can consume request/CPU allowance. Cloudflare documents that matching requests can fail once free limits are exceeded. Review selective asset-first routing before concluding that the site needs more capacity. Preserve routing, security headers, correct 404s, and private-page protections during that work.

Recommendation: buy Workers Paid if actual usage, CPU needs, or availability risk justify it. There is no evidence here that an upgrade would improve rankings. Keep long-lived caching for fingerprinted assets and measure public HTML caching before changing it.

Performance goals should use real visitors at the 75th percentile: LCP at most 2.5s, INP at most 200ms, CLS at most 0.1. These are [Web Vitals targets](https://web.dev/articles/vitals), not measurements of OMG. Capture mobile lab diagnostics and field data before deciding whether fonts, scripts, or caching need work. [Lab and field results differ](https://web.dev/articles/lab-and-field-data-differences).

## 7. Measurement and rollout

No Google verification TXT record was found in the inspected zone records. This does not prove Search Console is unverified: another property/verification mechanism may be in use. Establish access and inspect actual indexing and search data before setting numeric traffic targets.

| Phase | Work | Evidence of completion |
| --- | --- | --- |
| First | Domain redirects; search properties; baseline | Correct redirect map; inspected index coverage and canonical selection; sitemap accepted |
| Next | Homepage clarity, mobile navigation, shared metadata | Mobile navigation works; all public routes pass release checks; accurate social previews |
| Content | Publish verified Node/Bun/npm-pnpm/migration guides | Commands reproduced on supported environments; linked and included in sitemap |
| Differentiation | Comparison, environment example, benchmark methodology | Dated source-backed comparison and reusable example with honest limitations |
| Distribution | Share useful releases/guides with relevant communities | Relevant referrals and qualified engagement; no fabricated endorsements |
| Iterate | Search/AI reports and conversion review | Improve pages from actual queries, weak click-through, failed journeys, and citation evidence |

Track non-branded organic clicks, indexed intended pages, impressions by topic, click-through rate, key landing-page actions, AI referrals/citations, and real-user performance. Compare stable time windows and annotate releases. No traffic forecast or keyword-volume claim is supported by this audit.

Build authority through original demonstrations, reproducible results, helpful contributions, and maintained documentation that others have reason to reference. Avoid mass-produced keyword pages, purchased ranking links, fake reviews, and inauthentic mentions; these conflict with [Google's spam policies](https://developers.google.com/search/docs/essentials/spam-policies).

**Recommended next implementation scope:** finish the public-domain migration, establish search measurement, improve mobile navigation and homepage clarity, then publish the first verified runtime/workflow pages. The optional agent-documentation work follows those essentials.
