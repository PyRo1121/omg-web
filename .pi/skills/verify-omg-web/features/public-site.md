# Public site

## Sub-features

- Marketing hero and installation entry
- Pro and Team pricing controls
- Introductory-offer control
- Compact 320×568 layout without horizontal overflow
- Bounded checkout-result projection

## How to get to it (user POV)

Open `/`. Scroll from “Stop managing package managers.” to “The core stays free.” and the pricing controls. A checkout result returns to `/?success=true&session_id=<reference>`.

## Driving it with Playwright

From `site/` with the local instance healthy:

```bash
npm run test:e2e -- e2e/anonymous.spec.ts \
  --grep 'complete pricing surface|bounded checkout verification state'
```

The proof is visible headings and enabled pricing controls at 320×568, plus `scrollWidth <= clientWidth`. The invalid checkout reference must render “We could not verify this checkout.” and a same-origin sign-in link.

## Gotchas

- Local Vite has no auth, D1, rate-limit, or private Worker bindings.
- Do not create a Checkout Session merely to characterize the page.
- Keep reduced motion enabled as configured by the spec.
