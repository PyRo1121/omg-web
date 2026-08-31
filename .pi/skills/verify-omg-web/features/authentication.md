# Authentication

## Sub-features

- Login entry with email/password and GitHub OAuth
- OAuth-only signup
- Enumeration-resistant invalid credentials
- Protected account/admin redirects
- Logout and session invalidation

## How to get to it (user POV)

Open `/login/` or `/signup/`. Anonymous visits to `/dashboard/` and `/admin/` return to login. An authenticated user signs out from the account workspace.

## Driving it with Playwright

Anonymous deployed proof:

```bash
E2E_BASE_URL=https://<svelte-deployment> npm run test:e2e:external -- \
  e2e/anonymous.spec.ts e2e/signup.spec.ts
```

Controlled user proof:

```bash
E2E_BASE_URL=https://<svelte-deployment> \
E2E_USER_EMAIL=... E2E_USER_PASSWORD='...' \
npm run test:e2e:external -- e2e/staging-auth.spec.ts \
  --grep 'login, account navigation, non-admin authorization, and logout'
```

Proof includes the complete entry controls, no password registration controls, neutral invalid-credential text, protected redirects, post-logout return to `/`, and a subsequent protected redirect to login.

## Gotchas

- Local Vite deliberately returns `503` at bound auth routes; it cannot prove this feature.
- Never record credentials, cookies, session tokens, or OAuth inputs.
- Production and shadow use distinct auth secrets and OAuth clients.
- Run one authenticated suite at a time because logout invalidates the controlled session.
