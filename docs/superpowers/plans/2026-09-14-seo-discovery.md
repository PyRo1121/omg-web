# SEO and discovery implementation plan

> Execute inline with focused behavioral tests and a final independent review.

**Goal:** Implement the approved SEO research plan and remove duplication and obsolete public-site code.

**Architecture:** Retain SvelteKit and Cloudflare. Share metadata through one component; use a small public content registry for sitemap and navigation, with authored content rendered through the existing escaped documentation blocks. Keep public pages prerenderable and account/API routes unchanged.

**Spec:** ../../../exa-results/omg-seo-2026-09-14/research.md

## Constraints

- Preserve existing user changes and work on codex/seo-discovery-cleanup.
- No new runtime dependencies, invented benchmarks, reviews, support claims, or ranking promises.
- Public canonical origin remains https://getomg.xyz; trailing slashes remain canonical.
- New guide provenance distinguishes source review from execution on supported platforms.
- Infrastructure changes must preserve private/API/installer behavior. Search Console ownership and reports require actual account access.

## Tasks

- [ ] Metadata: test missing sharing metadata on updates; introduce SeoHead; replace duplicated public head blocks; retain structured data and per-page canonicals.
- [ ] Content: add Node, Bun, Python, npm/pnpm workflow, nvm migration, environment guide, and dated mise comparison. Reuse DocsBlocks; supply index pages and contextual links.
- [ ] Discovery: extend sitemap with authored content modification dates and add generated Markdown/llms index from the same content. Test public output, unknown slugs, and escaped structured data.
- [ ] Navigation: accessible mobile menu; clarify homepage; link runtime and workflow guides. Verify keyboard/mobile navigation and canonical metadata after client navigation.
- [ ] Debt: remove duplicate metadata/constants, empty scripts, obsolete styles and proved-unused exports; run existing policy checks. Do not delete reviewed assets merely because references are indirect.
- [ ] Migration: inspect old-host routes/rules; prepare exact permanent public-page redirect configuration and verify safe scope. Do not change subscriptions.
- [ ] Measurement: document verified Search Console/Bing setup steps; add a deploy-ready IndexNow notifier that submits only changed public pages when configured.
- [ ] Verification: site unit tests, type checks, lint/format, source/unused-export checks, production build/bundle budget, browser review, public E2E, final diff review.

## Baseline

314 site tests passed across 54 files. Unused-export check passed across 261 production modules. Existing worktree contained only the research artifacts created for this task.

## Progress

Implementation in progress. Public deployment and search-account actions will be recorded explicitly with their actual result.
