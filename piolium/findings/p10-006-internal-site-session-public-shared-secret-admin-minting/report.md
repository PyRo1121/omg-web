# Report: Internal site-session endpoint publicly reachable with single static shared secret and attacker-controlled admin role minting

- **Finding ID:** p10-006 (`internal-site-session-public-shared-secret-admin-minting`)
- **Severity:** Medium (final, after adversarial review; initially triaged High)
- **Vulnerability class:** Broken access control / exposed internal endpoint (CWE-284, CWE-306)
- **PoC status:** Executed (real workerd + local D1 environment)

## Summary

`POST /api/internal/site-session` is designed as an intra-cloud service-binding endpoint: the omg-site BFF calls it to mint Worker sessions from Better Auth identities. However, it is registered in the **same public route table** as every customer-facing API route ([site/workers/src/worker.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/worker.ts) L255), making it reachable by anyone on the internet at the public API hostname.

Its only guard is a single static shared secret — the `X-Admin-Secret` header compared against `ADMIN_API_SECRET`. The comparison itself is timing-safe and fail-closed when unset ([site/workers/src/admin-secret.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/admin-secret.ts)); the flaw is the **exposure topology**, not the comparison. Anyone who obtains this one secret (leak, weak value, compromised CI or integration) can mint arbitrary customer rows and sessions **with `role: 'admin'` projection**, because the request body's `role` field is written directly into `customers.admin = 1`, granting full access to every `/api/admin/*` route including PII CSV exports. There is no network-layer enforcement that traffic arrived via service binding, no IP allowlist, and no rate limit on this route.

## Details

The Worker uses an exact-switch dispatcher with no middleware layer. The internal route sits alongside public routes:

```ts
// site/workers/src/worker.ts (L255-256)
case '/api/internal/site-session':
  return handleCreateSiteSession(request, env);
```

The handler performs exactly one authentication step — the static secret check:

```ts
// site/workers/src/handlers/site-session.ts (L184-188)
yield* requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET);
const body = yield* decodeJsonBody(request, SiteSessionRequestSchema);
const existing = yield* findCustomerByEmail(env.DB, body.email);
const projected = existing ?? (yield* provisionSiteCustomer(env.DB, body, request));
const customer = yield* syncCustomerRole(env.DB, projected, body.role);
```

The secret check itself is individually correct — constant-time comparison, fail-closed when unset or empty:

```ts
// site/workers/src/admin-secret.ts
if (expected === undefined || expected.length === 0) {
  return Effect.fail(new AdminUnauthorizedError());
}
if (provided === null || !timingSafeEqualUtf8(provided, expected)) {
  return Effect.fail(new AdminUnauthorizedError());
}
```

The privilege escalation comes from `syncCustomerRole`: the caller-supplied `role` field drives the admin projection directly:

```ts
// site/workers/src/handlers/site-session.ts (syncCustomerRole, L103-116)
return db.prepare(`UPDATE customers SET admin = ? WHERE id = ?`).bind(admin, customer.id).run()
```

where `admin = role === 'admin' ? 1 : 0` — i.e., an attacker fully controls the persisted admin flag via the JSON body.

Finally, the route registry classifies this route as internal transport ([site/shared/licensing-routes.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/shared/licensing-routes.ts) L161-166):

```ts
internalSiteSession: {
  method: 'POST',
  path: '/api/internal/site-session',
  authentication: 'admin-secret',
  transport: 'internal',
},
```

but the dispatcher never enforces `transport: 'internal'` — any externally routable HTTP request resolves to the identical handler. No binding-context check, IP allowlist, mTLS/service-token requirement, or rate limit exists on the path.

## Root Cause

1. **Missing environmental control:** the `transport: 'internal'` classification in the route registry is documentation-only; dispatch does not verify that requests arrived via the Cloudflare service binding rather than the public internet.
2. **Single-factor static secret as sole guard:** possession of one long-lived static value (`ADMIN_API_SECRET`) is the entire authentication story for an endpoint that mints privileged sessions.
3. **Attacker-controlled role elevation:** the request body's `role` field is trusted to set `customers.admin = 1` without any server-side verification against the actual Better Auth identity.

## Proof of Concept

The PoC script at [`piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/poc.sh`](piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/poc.sh) was executed against the real production Worker source running in workerd via `wrangler dev --port 8799` with local D1 migrations applied (see `evidence/env-info.txt`). It performs three steps plus a control:

1. **Mint** — a plain external-style POST to `/api/internal/site-session` carrying only `X-Admin-Secret` and body `{"email":"attacker-…@evil.test","role":"admin"}`:
   ```
   POST http://127.0.0.1:8799/api/internal/site-session (public hostname form, no binding context)
   -> HTTP 200: {"token":"[REDACTED:secret]","expiresAt":"2026-08-30T07:50:30.795Z","customerId":"1cc2a980-b5a4-47cd-9ab2-a711ca5b0a2f"}
   ```
2. **Escalate** — present the minted token as `Authorization: Bearer` against the admin surface:
   ```
   GET /api/admin/dashboard -> HTTP 200
   ```
3. **Exfiltrate** — retrieve the admin PII CSV export:
   ```
   GET /api/admin/export/users -> HTTP 200, 186 bytes
   id,email,company,created_at,tier,status,active_machines,total_commands
   1cc2a980-...,attacker-poc-1787471430@evil.test,attacker,...
   ```
4. **Control** — the identical mint request *without* the header fails closed:
   ```
   no-secret mint -> HTTP 401
   ```

Full transcripts are preserved in [`evidence/exploit.log`](piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/evidence/exploit.log) and [`evidence/setup.log`](piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/evidence/setup.log).

## Impact

Observed behavior (from the executed PoC): a request in public form, authenticated by nothing but the static shared secret, minted a live 30-day session whose D1 customer row carries `"admin": 1` (confirmed by direct database inspection in `evidence/impact.log`) and returned HTTP 200 from `/api/admin/dashboard`, `/api/admin/users`, and `/api/admin/export/users`.

Inferred impact for production:

- A holder of `ADMIN_API_SECRET` (via repo-history leak, log exposure, misconfigured wrangler secret listing, or a compromised non-admin integration holding the secret) gains **full administrative access** to all ~26 `/api/admin/*` routes: PII CSV exports, tier manipulation, license control, CRM data reads.
- Because `syncCustomerRole` persists the admin flag, the attacker-created customer row remains privileged beyond the session lifetime until manually reverted.
- No rate limiting on the route means a low-entropy secret would also be brute-forceable; no IP allowlist or binding enforcement means the attack works from anywhere on the internet.

The severity is tempered by the precondition that the attacker must first obtain the single static secret — hence final severity **Medium** rather than High.

## Remediation

1. **Enforce internal transport at dispatch:** reject requests to `transport: 'internal'` routes unless they demonstrably arrived via the service binding (e.g., require the shared secret *plus* a per-request HMAC derived from a binding-only credential, or move the route to a dedicated internal-only worker reachable only through bindings).
2. **Remove role elevation from the request contract:** stop accepting a caller-supplied `role` on this endpoint; derive `customers.admin` server-side from the verified Better Auth identity, not from the body.
3. **Defense-in-depth:** add rate limiting and (if feasible) network-layer restrictions (IP allowlist / WAF rule scoped to known BFF origins) for the internal path, and rotate `ADMIN_API_SECRET` on a schedule with entropy requirements.

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:08:56Z
Confirm-Evidence: piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/evidence/confirmed-20260823T090853Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: session token minted via public-form POST to /api/internal/site-session with only the static X-Admin-Secret; token grants HTTP 200 on /api/admin/dashboard and retrieves /api/admin/export/users PII export (customers.admin=1 written from attacker-controlled role field)
