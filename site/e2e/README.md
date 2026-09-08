# Svelte browser characterization

Playwright owns browser-level characterization for the SvelteKit public, account, and operator surfaces.

## Local public checks

The CI-safe suite starts plain Vite without Cloudflare bindings and verifies the current Svelte source: compact home layout, documentation, legal pages, sitemap, and crawler policy.

```bash
npm run test:e2e:public
```

Authentication routes deliberately return `503` when Cloudflare bindings are absent, so local browser checks do not weaken or mock that boundary. Unit and route tests cover the server behavior directly.

## Deployed anonymous checks

Point Playwright at a deployed Svelte runtime to add login, signup, protected-route redirect, and invalid-credential characterization:

```bash
E2E_BASE_URL=https://<svelte-deployment> npm run test:e2e:external -- \
  e2e/anonymous.spec.ts e2e/signup.spec.ts
```

## Authenticated checks

Authenticated characterization also requires the designated controlled accounts. Credentials are provided per run and never committed.

```bash
E2E_BASE_URL=https://<svelte-deployment> \
E2E_USER_EMAIL=... \
E2E_USER_PASSWORD='...' \
E2E_ADMIN_EMAIL=... \
E2E_ADMIN_PASSWORD='...' \
npm run test:e2e:external -- e2e/staging-auth.spec.ts
```

The authenticated suite covers login, account navigation, non-admin operator rejection, logout, operator authorization, and the fixed-name bounded users CSV export.

Only one authenticated run may target a deployment at a time because logout invalidates the shared controlled session. Use a CI concurrency group if this suite is automated.

The production Worker uses Stripe live mode. Browser automation never creates Checkout Sessions or Stripe customers. Complete billing characterization only during an approved controlled release check.

Install the pinned Chromium runtime before the first local run:

```bash
npx playwright install chromium
```
