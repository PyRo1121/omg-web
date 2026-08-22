# Browser characterization

Playwright owns browser-level authorization and critical-flow characterization for the current SolidStart application.

## Anonymous checks

Anonymous checks run against a local `vinxi dev` server and verify that `/admin` and `/dashboard` redirect to `/login`, that the complete login and signup surfaces are rendered, that password signup rejects mismatched passwords client-side, and that the upgrade modal degrades gracefully when the checkout backend is unavailable.

```bash
npx playwright test e2e/anonymous.spec.ts e2e/signup.spec.ts e2e/billing-unconfigured.spec.ts
```

(The npm script `test:e2e:anonymous` still targets `anonymous.spec.ts` only.)

Specs sharing hydration-tolerant click helpers live in `e2e/helpers.ts`; use `clickUntilEffectHolds` for clicks on server-rendered buttons (a pre-hydration click is a silent no-op) instead of sleeping.

## Authenticated checks

Authenticated characterization targets a running deployment chosen via `E2E_BASE_URL`. Production has two designated E2E users (`e2e-user@latham.cloud`, `e2e-admin@latham.cloud`); passwords are provided per-run through `E2E_*` environment variables and never committed.

```bash
E2E_BASE_URL=https://omg.latham.cloud \
E2E_USER_EMAIL=... \
E2E_USER_PASSWORD='...' \
E2E_ADMIN_EMAIL=... \
E2E_ADMIN_PASSWORD='...' \
npm run test:e2e:staging
```

The authenticated suite covers user login, dashboard rendering, the authenticated licensing BFF, non-admin `/admin` authorization, logout, admin authorization, and an admin CSV export.

Checkout creation is skipped unless it is explicitly enabled, and it exercises Stripe test mode (the wired sandbox), never live Stripe:

```bash
E2E_ALLOW_MUTATIONS=true npm run test:e2e:staging
```

Install the pinned Chromium runtime before the first local run:

```bash
npx playwright install chromium
```
