# Website authentication operations

- **Status:** SvelteKit is the only maintained website runtime. `getomg.xyz` is not live yet.
- **Authority:** `site/src/lib/server/auth.server.ts`
- **Persistence:** `omg-platform` D1 Better Auth tables

## Session contract

The production SvelteKit Worker uses an Alchemy-managed `BETTER_AUTH_SECRET`. The secret is stable across ordinary plans and deployments and is redacted from output. The shadow and production stages use different secrets.

Sessions issued by the previous website Worker are not portable. Cookies for `omg.latham.cloud` are not sent to `getomg.xyz`. Existing database rows may remain during rollback, but users sign in again and receive a SvelteKit-owned session.

Do not copy the shadow secret into production. Do not log, print, export, or persist either secret outside Alchemy state.

## Runtime boundaries

- `/api/auth/*` is handled by Better Auth through the SvelteKit server hook.
- Login and signup entry routes expose no provider secrets.
- Mutating auth requests use the `AUTH_RATE_LIMITER` binding and fail closed when it is unavailable.
- GitHub OAuth requires the production callback URL `https://getomg.xyz/api/auth/callback/github`.
- Use a separate GitHub OAuth application for `getomg.xyz` during rollback. Do not break sign-in on `omg.latham.cloud` before the new domain passes production checks.
- Customer and administrator authority is re-read from D1 before private Worker access.
- Private Worker calls use the caller-specific `SVELTE_BFF_SECRET`; browser code never receives it.
- Organization invitation email delivery crosses the private `LICENSING_API` Service Binding and returns a bounded acknowledgement.

## Prelaunch checks

1. `ShadowAuthSecret` is `noop` in both shadow and production Alchemy plans.
2. GitHub client configuration is present in the target stage without exposing values.
3. Anonymous session lookup returns `null` rather than a server error.
4. Invalid credentials receive a generic rejection.
5. `/dashboard/` and `/admin/` redirect unauthenticated users to `/login/`.
6. Unit and integration tests cover credential parsing, rate-limit failure, D1 role lookup, Worker session minting, billing redirects, invitation delivery, organization authorization, and administrator authorization.
7. Run `site/e2e/staging-auth.spec.ts` against the deployment when user and administrator credentials are available. A skipped credential suite is recorded as unverified evidence, not a pass.

## Launch behavior

- Attach the whole `getomg.xyz` hostname. Never route `/api/auth/*` separately from the pages that consume its cookies.
- Do not rotate the production SvelteKit secret during domain attachment.
- Do not prune old session rows until the rollback Worker has been retired.
- Watch auth failures, 5xx responses, and rate-limit errors during the observation window.

## Rotate the secret after launch

Secret rotation is a separate maintenance change after the hostname and Worker inventory are stable.

1. Verify the current Alchemy plan is a no-op.
2. Prepare the replacement secret through the approved secret provider without exposing it to shell history or logs.
3. Deploy during a declared logout window.
4. Verify anonymous lookup, invalid login, GitHub callback configuration, user login, administrator login, sign-out, and protected redirects.
5. Roll back the Worker version if any gate fails.
6. Prune superseded sessions only after the new version has passed its observation window.

The exact Better Auth and SvelteKit versions remain pinned in `site/package.json`. Do not use `--legacy-peer-deps`; the package-scoped override is the reviewed compatibility mechanism.
