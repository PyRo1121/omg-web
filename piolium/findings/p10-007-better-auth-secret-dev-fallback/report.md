# [p10-007] Hardcoded dev fallback for `BETTER_AUTH_SECRET` silently degrades Better Auth session verification to a public constant

**Vulnerability class**: Improper secret handling / fail-open fallback to a hard-coded credential
**CWE**: CWE-798 (Use of Hard-coded Credentials) / CWE-1188 (Insecure Default Initialization of Resource)
**Severity**: Medium
**CVSS v3.1 (guidance)**: ~6.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N) — requires a misconfigured deployment (`BETTER_AUTH_SECRET` unset) plus knowledge of an attacker-reachable raw session token; the constant itself is public.
**PoC status**: Executed against a production build of the Worker under workerd.

## Summary

The authenticated dashboard of omg-site is guarded by a `'use server'` function that constructs its Better Auth environment inline and falls back to a hard-coded constant when the `BETTER_AUTH_SECRET` binding is missing: `BETTER_AUTH_SECRET: cf.BETTER_AUTH_SECRET || 'dev-secret-change-me'`. Because the constant ships in the public repository, any deployment where the secret binding is absent or empty verifies dashboard session cookies against a key every attacker can read. An attacker who obtains a victim's raw session token (stored unsigned in D1 and exposed via logs or DB dumps) can compute the cookie signature offline with the public constant and impersonate that victim on `/dashboard`. The failure mode is partially silent — sign-up/sign-in keep working under better-auth's own default constant — which is exactly why such a misconfiguration can survive to production. Confirmed by execution against the real Worker: a forged cookie keyed on `dev-secret-change-me` rendered another user's account as authenticated, while identical forgeries keyed on a wrong constant were rejected.

## Details

The entire authenticated dashboard surface is protected by `requireAuth()`, defined in [`site/src/routes/dashboard.tsx`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/src/routes/dashboard.tsx#L17-L36). Instead of failing closed when the required secret binding is missing, it substitutes a public literal:

```ts
async function requireAuth() {
  'use server';
  // ...
  const env: CloudflareEnv = {
    DB: cf.DB,
    BETTER_AUTH_SECRET: cf.BETTER_AUTH_SECRET || 'dev-secret-change-me',
    BETTER_AUTH_URL: cf.BETTER_AUTH_URL || 'http://localhost:3000',
    // ...
  };

  const auth = createAuth(env);
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });

  if (!session?.user) {
    throw redirect('/login');
  }
```

Better Auth signs session cookies as `<token>.<base64(HMAC-SHA256(token, secret))>` and `auth.api.getSession()` verifies that HMAC using whatever secret it was given. With this fallback in place, the guard's effective key material becomes `'dev-secret-change-me'` — a value readable by anyone with repository access. The verification itself is still performed (a wrong-key forgery is rejected), but the key it checks against provides zero secrecy.

Two conditions make this exploitable in practice:

1. **Nothing in the repository enforces the binding.** [`site/wrangler.toml`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/wrangler.toml) declares no vars/secrets for the site Worker, so a deploy without `BETTER_AUTH_SECRET` starts successfully. An empty-string binding also triggers the fallback due to JS falsy semantics.
2. **The misconfiguration degrades silently rather than erroring.** In the same deployment, the auth API at `/api/auth/*` keeps functioning because better-auth internally falls back to its own hardcoded default constant, so registration and login continue to work normally. Only the low-entropy-secret warning in the server log hints anything is off. A broken-looking site gets fixed; a working-looking one does not.

A companion fallback on the same object, `BETTER_AUTH_URL: cf.BETTER_AUTH_URL || 'http://localhost:3000'`, additionally shifts `baseURL`/`trustedOrigins` toward localhost in whatever flows consume this env object, further relaxing origin checks in degraded deployments.

By contrast, [`site/src/lib/auth.ts`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/src/lib/auth.ts#L35-L43) handles configuration errors fail-closed elsewhere — it throws on an unparsable base URL — but accepts any string as the secret, so no other layer catches the substitution.

## Root Cause

A convenience dev-fallback (`|| 'dev-secret-change-me'`) embedded in the production auth path of `requireAuth()` converts "required secret absent" from a loud startup/deploy failure into a silent downgrade of session-cookie HMAC verification to a publicly known constant. Secret handling is inconsistent across the codebase: URL misconfiguration throws, but secret absence silently substitutes a literal.

## Proof of Concept (PoC)

PoC-Status: **executed** — run against the real production Worker build (vinxi build → `dist/_worker.js`) served by wrangler 4.125.0 / workerd with local D1 and **no `BETTER_AUTH_SECRET` binding**, at commit `6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86`. The full script is at `piolium/findings/p10-007-better-auth-secret-dev-fallback/poc.sh`; raw output in `piolium/findings/p10-007-better-auth-secret-dev-fallback/evidence/exploit.log`.

Steps:

1. Start the Worker with `BETTER_AUTH_SECRET` deliberately unset (as `site/wrangler.toml` permits). Sign-up/sign-in still work — better-auth falls back to its own internal default constant, so the misconfiguration produces no visible error.
2. Register and sign in as a victim via `POST /api/auth/sign-up/email`; retrieve their raw (unsigned) session token from `GET /api/auth/get-session`. Observed token: [REDACTED:secret]
3. Offline, compute the forged cookie using only the public repo constant:

   ```bash
   sig=$(printf %s "$TOKEN" | openssl dgst -sha256 -hmac 'dev-secret-change-me' -binary \
         | openssl base64 -A | sed 's/+/%2B/g; s/\//%2F/g; s/=/%3D/g')
   ```

4. Request `GET /dashboard` with `Cookie: [REDACTED:cookie]

Observed results (from `evidence/exploit.log`):

```
[*] Control A (no cookie):
    '/login' redirect markers in body: 1
[*] Control B (forgery keyed on wrong constant):
          5 /login
[*] Exploit (forgery keyed on dev-secret-change-me):
          4 /login
          1 victim-poc-1787472617@corp.test
{"status":"confirmed","evidence":"GET /dashboard rendered victim-poc account as
authenticated (victim email in SSR body) using a cookie whose signature was computed
offline from only the public constant dev-secret-change-me + a leaked raw session token;
controls: no-cookie and wrong-key forgeries both land on the /login redirect", ...}
```

Both controls behave as expected: an unauthenticated request stays on the login redirect, and an identical forgery keyed on a wrong constant is rejected — proving the guard genuinely verifies the HMAC and that its effective key is the public constant. Only the forgery signed with `dev-secret-change-me` renders the victim's authenticated dashboard (victim email present in the SSR body).

Supporting evidence from `evidence/impact.log`: with the binding unset, the server-side Set-Cookie signature was recomputed byte-for-byte offline using only public constants (observed signature matched the recomputed signature exactly), confirming every HMAC key on every auth surface in this degraded deployment is readable in public source.

## Impact

- **Cross-user impersonation of the guarded dashboard surface.** During degraded mode, anyone holding a victim's raw session token (which Better Auth stores unsigned in D1's `auth_session.token`, so it leaks via logs, DB dumps, or backups) can forge a valid dashboard cookie for that victim — no deployed secret knowledge required.
- **Fail-open secret handling.** Losing a critical secret binding should visibly break authentication. Here it instead downgrades to forgeable verification while keeping the site looking fully functional, so the dangerous state is self-sustaining in production.
- **Exposure scope.** Only deployments of omg-site where `BETTER_AUTH_SECRET` is missing or empty are affected; correctly configured deployments are not impacted. However, nothing in-repo (no `wrangler.toml` declaration, no startup validation) prevents that state. Other consumers of `BETTER_AUTH_SECRET` (`/api/auth/*`, the licensing BFF `[...path].ts`) fail closed relative to this path, making the dashboard the soft spot.
- **Secondary effect.** The `BETTER_AUTH_URL || 'http://localhost:3000'` fallback silently changes `trustedOrigins` in the same degraded mode, weakening origin checks in flows that consume this env object.

## Remediation

1. Remove both fallbacks in `requireAuth()` ([`site/src/routes/dashboard.tsx:21-22`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/src/routes/dashboard.tsx#L21-L22)); pass `cf.BETTER_AUTH_SECRET` through unmodified, matching the production auth path in [`site/src/routes/api/auth/[...auth].ts`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/src/routes/api/auth/%5B...auth%5D.ts#L12-L25).
2. Throw at startup (or first use) when `cf.BETTER_AUTH_SECRET` is undefined or empty so a misconfigured deploy fails loudly and closed instead of degrading silently. Mirror the existing fail-closed pattern for `BETTER_AUTH_URL` in `site/src/lib/auth.ts`.
3. Add build/deploy-time validation of required bindings (e.g., declare the secret expectation in `site/wrangler.toml` / CI checks) so a Worker without the binding cannot ship.
4. If a dev-mode default is genuinely needed, gate it behind an explicit non-production flag (e.g., `NODE_ENV !== 'production'`) rather than an unconditional `||` fallback.

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:08:56Z
Confirm-Evidence: piolium/findings/p10-007-better-auth-secret-dev-fallback/evidence/confirmed-20260823T090856Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: GET /dashboard rendered victim-poc account as authenticated (victim email in SSR body) using a cookie whose signature was computed offline from only the public constant dev-secret-change-me + a leaked raw session token; controls: no-cookie and wrong-key forgeries both land on the
