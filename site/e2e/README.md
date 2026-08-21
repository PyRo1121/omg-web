# Browser characterization

Playwright owns browser-level authorization and critical-flow characterization for the current SolidStart application.

## Anonymous checks

Anonymous checks run against a local `vinxi dev` server and verify that `/admin` and `/dashboard` redirect to `/login`, and that the complete login surface is rendered.

```bash
npm run test:e2e:anonymous
```

## Staging checks

Authenticated checks must target an isolated staging deployment with private test users and sandbox Stripe configuration. Do not point mutation-enabled checks at production.

```bash
E2E_BASE_URL=https://staging.example.com \
E2E_USER_EMAIL=user@example.com \
E2E_USER_PASSWORD='...' \
E2E_ADMIN_EMAIL=admin@example.com \
E2E_ADMIN_PASSWORD='...' \
npm run test:e2e:staging
```

The staging suite covers user login, dashboard rendering, the authenticated licensing BFF, non-admin `/admin` authorization, logout, admin authorization, and an admin CSV export.

Checkout creation is skipped unless it is explicitly enabled for an isolated Stripe sandbox:

```bash
E2E_ALLOW_MUTATIONS=true npm run test:e2e:staging
```

Install the pinned Chromium runtime before the first local run:

```bash
npx playwright install chromium
```
