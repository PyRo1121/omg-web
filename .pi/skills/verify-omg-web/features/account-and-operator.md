# Account and operator workspaces

## Sub-features

- Account overview, analytics, achievements, machines, settings, and organization routes
- Non-admin operator rejection
- Operator command center, customers, organizations, analytics, insights, revenue, audit, and live activity
- Fixed-name bounded users CSV export

## How to get to it (user POV)

Sign in with a controlled user and open `/dashboard/`. Use “Account workspace” navigation. An operator signs in with the controlled admin account and opens `/admin/`, then uses “Admin console” navigation.

## Driving it with Playwright

Run only against the approved deployed Svelte runtime:

```bash
E2E_BASE_URL=https://<svelte-deployment> \
E2E_USER_EMAIL=... E2E_USER_PASSWORD='...' \
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD='...' \
npm run test:e2e:external -- e2e/staging-auth.spec.ts
```

User proof includes Analytics navigation, non-admin rejection from `/admin/`, logout, and post-logout protection. Operator proof includes “Today at OMG”, Audit navigation, a download named `omg-users.csv`, and the exact privacy-reduced CSV header.

## Verified live checks (2026-09-01, headed Helium via `agent-browser` 0.34.0)

- Compact account, settings, admin, and eligible-organization bootstrap layouts render with stable ARIA labels.
- Billing Portal fails closed for an account with no linked Stripe customer.
- All three operator exports return `200` with fixed names (`omg-users.csv`, `omg-usage.csv`, `omg-audit.csv`), `text/csv; charset=utf-8`, `private, no-store`, `nosniff`, bounded UTF-8 bodies under 2 MiB. Note the Worker CSV headers are `date,...` for usage, `created_at,...` for audit, and `id,email,...` for users; assert against those, not `email,` or `occurred_at,`.
- Logout returns to `/` and a direct `/dashboard/` request redirects to `/login/`.
- CSP has no `'unsafe-inline'` in `script-src`; connect/script sources stay same-origin plus Cloudflare Insights; `nosniff` is present.
- Privacy policy shows version `2.1` with the GPC/DNT disclosure; robots disallows protected routes; sitemap lists public routes only.
- With `globalPrivacyControl` and `doNotTrack` injected before page code, zero `/api/analytics/site` requests fire.
- Admin roster and exports contain personal data; use targeted snapshots and never broad authenticated admin captures in transcripts.

## Gotchas

- Credentials are controlled inputs and never evidence.
- Do not create an organization or invitation only to inspect a state. The one approved persistent development organization plus staging E2E recipient is the sole invitation-characterization fixture.
- The CSV is private, same-origin, bounded, and must not expose private provider, session, machine, or database identifiers.
- Live activity polling and invitation email characterization require their separately approved live checks; the compact suite does not prove them.
