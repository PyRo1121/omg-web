# Documentation and legal

## Sub-features

- Documentation landing page and CLI reference link
- Public sitemap
- Privacy policy, data-retention section, and truthful rights-request guidance
- Terms of service and acceptable-use section
- Crawler exclusions for protected workspaces

## How to get to it (user POV)

Open `/docs/`, `/privacy/`, and `/terms/` from the public site. Crawlers reach `/sitemap.xml` and `/robots.txt` directly.

## Driving it with Playwright

From `site-svelte/`:

```bash
npm run test:e2e -- e2e/anonymous.spec.ts \
  --grep 'documentation entry surface|legal pages and the crawler policy'
```

The docs proof includes the “Learn the parts you need.” and “Install OMG” headings, the real GitHub CLI-reference destination, and a sitemap containing `/docs/` but no protected or invented docs routes. Legal proof includes the expected headings and directs access, deletion, and opt-out requests to support without claiming nonexistent Account settings controls. Robots must disallow `/dashboard` and `/admin` and advertise the canonical sitemap.

## Gotchas

- The sitemap host remains the canonical production hostname even during local or shadow verification.
- `/docs/` is Svelte-owned; do not revive the deleted docs-proxy Worker.
- Protected routes must never enter the public sitemap.
