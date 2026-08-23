---
id: p10-007
phase: P10
sequence: 7
slug: better-auth-secret-dev-fallback
status: valid
verdict: VALID
severity: medium
title: Hardcoded dev fallback for BETTER_AUTH_SECRET silently degrades Better Auth session verification to a public constant
PoC-Status: executed
Protocol: http
Auth-Required: no
original: p7-002-better-auth-secret-dev-fallback.md
debate: piolium/chamber-workspace/C2-privilege-trust-boundary/debate.md
---

# p7-002 — Hardcoded dev fallback for BETTER_AUTH_SECRET silently degrades Better Auth session verification to a public constant

- **Contract**: SolidStart server-function runtime contract — `'use server'` functions execute server-side with deployment bindings and must fail closed when required secrets are absent. The production auth path (`site/src/routes/api/auth/[...auth].ts:12-25`) passes `cf.BETTER_AUTH_SECRET` through unmodified; the dashboard page guard does not.
- **Security Assumption**: Session-cookie HMAC verification always uses the deployed `BETTER_AUTH_SECRET`; a missing secret aborts rather than degrades.
- **Code Path**: `site/src/routes/dashboard.tsx:21` — `BETTER_AUTH_SECRET: cf.BETTER_AUTH_SECRET || 'dev-secret-change-me'` inside the `requireAuth` `'use server'` function (line 17), which guards the entire authenticated dashboard and feeds `createAuth(env).api.getSession()` (line 34). Companion fallback `BETTER_AUTH_URL: ... || 'http://localhost:3000'` (line 22) silently changes `baseURL`/`trustedOrigins` to localhost.
- **Gap Type**: runtime-mode
- **Attack Vector**: If the `BETTER_AUTH_SECRET` binding is unset (or set to an empty string) in any deployment of omg-site, the dashboard's session verification does not error — it transparently verifies cookies against the hardcoded, publicly-readable constant `dev-secret-change-me`. An attacker who knows the constant can forge a valid Better Auth session cookie for any user id and reach `/dashboard` as that user; every other consumer (`/api/auth/*`, licensing BFF `[...path].ts`) fails instead, making the misconfiguration partially silent — exactly the condition under which it survives to production. The localhost `trustedOrigins` fallback additionally relaxes origin checks in whatever flows consume this env object.
- **Exploit Conditions**: Deployment where `BETTER_AUTH_SECRET` is absent/empty for the omg-site Worker (wrangler.toml declares no vars/secrets for the site worker, so nothing in-repo enforces the binding's presence); attacker knowledge of the constant (it is in the public repo).
- **Impact**: Full account impersonation on the authenticated dashboard surface during the degraded mode; fail-open instead of fail-closed secret handling.
- **Severity**: MEDIUM
- **Evidence**:
  ```ts
  async function requireAuth() {
    'use server';
    ...
    const env: CloudflareEnv = {
      DB: cf.DB,
      BETTER_AUTH_SECRET: cf.BETTER_AUTH_SECRET || 'dev-secret-change-me',
      BETTER_AUTH_URL: cf.BETTER_AUTH_URL || 'http://localhost:3000',
  ```
  (`src/routes/dashboard.tsx:17-23`). Contrast fail-closed handling elsewhere: `src/lib/auth.ts:41-43` throws on unparsable URL but accepts any secret string.
- **Fix direction**: Remove the fallbacks; throw when `cf.BETTER_AUTH_SECRET` is missing so a misconfigured deploy is visibly broken rather than forgeable. Add startup validation of required bindings.
