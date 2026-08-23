# Anonymous Email-Keyed License Lookup Discloses Account Status, Tier, and Machine Counts for Any Address

**Severity:** Medium
**Vulnerability class:** Broken access control / information disclosure (customer & license enumeration oracle)
**CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor); CWE-204 (Observable Response Discrepancy)
**Affected endpoint:** `GET /api/get-license?email=<address>` (unauthenticated)

## Summary

`GET /api/get-license` requires **no credential of any kind** — the sole input is an arbitrary `email` query parameter, and the handler resolves the customer row purely by that address. It then returns the license tier, subscription status, expiry date, seat ceiling, active machine count, and a masked license key (prefix/suffix retained). Because no identity exists on the request, ownership is never checked. This makes the endpoint a systematic enumeration oracle: an attacker can confirm which emails are registered customers, their paying tier, subscription health (active/canceled/expired), fleet size, and harvest masked key prefix/suffix pairs for correlating leaked keys. The behavior was confirmed by executing the PoC against the production Worker code path in a local `wrangler dev` environment.

## Details

The route is registered as intentionally public in the shared route registry — `getLicense.authentication = 'none'` in [site/shared/licensing-routes.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/shared/licensing-routes.ts#L59-L64):

```ts
getLicense: {
  method: 'GET',
  path: '/api/get-license',
  authentication: 'none',
  transport: 'direct',
},
```

The worker dispatches the path straight to the handler with no guard ([site/workers/src/worker.ts#L213](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/worker.ts#L213)):

```ts
case '/api/get-license':
  return handleGetLicense(request, env);
```

The handler in [handleGetLicense](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L521) takes the attacker-supplied `email` as the **only** lookup key and joins licenses to customers on it:

```ts
const licenseRow = yield* queryFirst(
  env.DB,
  `SELECT l.license_key, l.tier, l.status, l.expires_at, l.max_seats as max_machines
   FROM licenses l
   JOIN customers c ON l.customer_id = c.id
   WHERE c.email = ?`,
  [email],
  'publicLicense'
);
if (licenseRow === null) {
  return { found: false as const };
}
```

A second query at [license.ts#L541](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L541) counts active machines by the same email-only predicate:

```ts
`SELECT COUNT(*) as count FROM machines m
 JOIN licenses l ON m.license_id = l.id
 JOIN customers c ON l.customer_id = c.id
 WHERE c.email = ? AND m.is_active = 1`
```

The response then returns the full license profile, including a masked key via `maskKey` ([license.ts#L36-L39](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L36-L39), used at [L555](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L555)):

```ts
const maskKey = (key: string) => {
  if (key.length <= 8) return `****${key.slice(-4)}`;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
};
// ...
return {
  found: true as const,
  license_key: maskKey(license.license_key),
  tier: license.tier,
  status: license.status,
  expires_at: license.expires_at,
  max_machines: license.max_machines,
  used_machines: used,
  // ...
```

The queries themselves are fully parameterized, so this is not an injection issue — it is the absence of an authentication/authorization step on an intentionally public route. No session, bearer token, API key, license key, or proof-of-ownership factor is involved anywhere in the path, so there is no ownership clause to enforce. This "silent missing check" class is why the bug passes SAST cleanly.

## Root Cause

The `get-license` route was made public (presumably to support a support/lookup or client check flow), but the data returned by `handleGetLicense` far exceeds what a public lookup needs. The handler trusts the caller-supplied `email` as the sole resource selector and returns tier, status, expiry, seat limits, active machine counts, and masked key fragments — with no credential check and no rate limiting on this path.

## Proof of Concept (PoC)

The PoC script is at `piolium/findings/p10-009-get-license-anonymous-email-enumeration/poc.sh` (with `setup.sh` provisioning a real `wrangler dev` workerd instance plus local D1 migrations and seeded victim accounts). It was **executed** against the production Worker code path; the transcript is in `evidence/exploit.log` and `evidence/impact.log`.

Steps (no credentials, headers, or cookies sent — verified: curl invocations carry no `-H`/`--user` flags):

1. Probe a registered customer:
   ```
   GET /api/get-license?email=victim.pro@example.test
   ```
   Observed (HTTP 200):
   ```json
   {"found":true,"license_key":"lic_••••0001","tier":"pro","status":"active","expires_at":"2027-01-01","max_machines":null,"used_machines":3}
   ```
2. Probe a second customer with a different tier/status:
   ```
   GET /api/get-license?email=victim.team@example.test
   ```
   Observed (HTTP 200):
   ```json
   {"found":true,"license_key":"lic_••••0001","tier":"team","status":"canceled","expires_at":"2026-01-01","max_machines":null,"used_machines":0}
   ```
3. Control — unregistered address:
   ```
   GET /api/get-license?email=nobody.unknown@example.test
   ```
   Observed (HTTP 200):
   ```json
   {"found":false}
   ```

The `found:true` vs `found:false` delta is a clean registration oracle; the per-victim responses disclose tier, subscription health, and fleet size.

## Impact

All of the following are **observed** behavior, not inference:

- **Registration oracle** — `found:true` vs `found:false` cleanly separates registered customers from non-customers for arbitrary email addresses, enabling list-driven account discovery.
- **Revenue profiling** — the paying tier (`pro` vs `team`) and subscription health (`active` vs `canceled`) are disclosed per address.
- **Fleet reconnaissance** — active machine count (`used_machines:3` above) and the seat ceiling reveal an organization's deployment size before targeted phishing.
- **Leak correlation** — masked key fragments (`lic_••••0001`) allow correlating partially-leaked license keys to specific victim accounts.

**Inferred scaling risk:** the endpoint is a plain `GET` with a single query parameter and no rate limiting on this path, so enumeration over scraped or purchased email lists is unthrottled. The data is most valuable for pre-attack reconnaissance of paying customers and for license-abuse workflows.

## Remediation

1. Require a proof-of-ownership factor (license key, authenticated session, or signed request) before returning any license data from `GET /api/get-license`.
2. If a public check-and-return flow is genuinely required, reduce the response to `{ found: boolean }` only — omit tier, status, expiry, seat/machine counts, and key fragments.
3. Add per-IP rate limiting on this route to blunt bulk enumeration.

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:08:57Z
Confirm-Evidence: piolium/findings/p10-009-get-license-anonymous-email-enumeration/evidence/confirmed-20260823T090856Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: unauthenticated GET /api/get-license?email=<victim> returned found:true with tier (pro/team), status (active/canceled), expires_at, max_machines, used_machines:3 and masked license_key prefix lic_ for seeded victims, while an unregistered email returned found:false — anonymous cu
