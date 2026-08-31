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

## Gotchas

- Credentials are controlled inputs and never evidence.
- Do not create an organization or invitation only to inspect a state.
- The CSV is private, same-origin, bounded, and must not expose private provider, session, machine, or database identifiers.
- Live activity polling and invitation email characterization require their separately approved live checks; the compact suite does not prove them.
