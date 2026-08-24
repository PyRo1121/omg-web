# Browser characterization

Playwright owns browser-level authorization and critical-flow characterization for the current SolidStart application.

## Anonymous checks

Anonymous checks run against a local `vinxi dev` server via the `chromium` project and verify that `/admin` and `/dashboard` redirect to `/login`, that the complete login and OAuth-only signup surfaces are rendered, that password registration controls remain absent, that invalid login credentials produce a generic error without navigating away, and that the upgrade modal degrades gracefully when the checkout backend is unavailable.

```bash
npx playwright test e2e/anonymous.spec.ts e2e/signup.spec.ts e2e/billing-unconfigured.spec.ts
```

Specs sharing hydration-tolerant click helpers and auth-surface selectors live in `e2e/helpers.ts`; use `clickUntilEffectHolds` for clicks on server-rendered buttons (a pre-hydration click is a silent no-op) instead of sleeping, and drive login through `performUiLogin` so the submission guard is always applied.

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

The authenticated suite covers user login, dashboard rendering, the authenticated licensing BFF, non-admin `/admin` authorization, logout, admin authorization, and an admin CSV export (filename plus header row).

### Shared-account concurrency invariant

The staging users are shared across every run: `logout` invalidates the session server-side, so two concurrent runs against the same deployment break each other's authenticated assertions. The config serializes workers within a run (`workers: 1`), but callers must ensure only ONE `test:e2e:staging` run is active per deployment — enforce a CI concurrency group on any workflow that runs it. Long term, replace shared accounts with per-run users or storageState session fixtures.

The production Worker uses Stripe live mode. The automated suite therefore never creates Checkout Sessions: even an unpaid live session can create durable Stripe customer data and pollute revenue operations. Validate checkout during a controlled release smoke test and immediately expire the session through Stripe CLI.

Install the pinned Chromium runtime before the first local run:

```bash
npx playwright install chromium
```
