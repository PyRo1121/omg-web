# Revoked machine resurrects itself — `validate-license` ignores `is_active` on the existing-machine path

- **ID:** p10-012 (`revoked-machine-resurrection`)
- **Severity:** High
- **Verdict:** VALID (confirmed via executed PoC against the real worker in workerd)
- **Vulnerability class:** Broken authorization / state-machine bypass (CWE-285, CWE-862)
- **CVSS 3.1 (estimated):** AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:N → **6.5 (Medium-High)**; license-enforcement impact raises practical severity
- **Affected surface:** `POST /api/validate-license` (CLI licensing endpoint), `site/workers/src/handlers/license.ts`

## Summary

Machine lifecycle is modeled as a two-state machine on `machines.is_active` (1 = active, 0 = revoked). Dashboard revoke endpoints write `is_active = 0`, and seat-limit enforcement counts only active rows. However, the *existing-machine* fast path in `registerOrTouchMachine` looks up machines with **no `is_active` predicate** and merely bumps `last_seen_at`. A revoked machine therefore transitions **revoked → fully valid** by simply calling `POST /api/validate-license` again: it receives a fresh signed ~7-day offline JWT with full tier/features claims, while its revocation simultaneously frees a seat that another distinct machine can claim. Revocation is reduced to a cosmetic dashboard action.

PoC status: **executed**. The decisive marker from the real-environment run:

```
p10-012 RESURRECTION: revoked machine re-validated valid=true fresh_signed_jwt=yes jwt_mid=victim-machine-dashboard-revoked jwt_validity_days=7 tier=pro features=8
p10-012 SEAT-FREED: second distinct machine activation valid=true while revoked machine still holds a valid JWT (max_machines=1)
```

## Details

The schema defines the lifecycle state:

```sql
-- site/workers/migrations/0000_current_baseline.sql (machines table)
is_active INTEGER DEFAULT 1,
revoked_at DATETIME,
UNIQUE(license_id, machine_id),
```

Revocation is performed by the authenticated dashboard handler, which flips only the flag:

```ts
// site/workers/src/handlers/dashboard.ts:191
const result = await env.DB.prepare(
  `
  UPDATE machines SET is_active = 0 WHERE license_id = ? AND machine_id = ?
`
)
  .bind(license.id, body.machine_id)
  .run();
```

The same `is_active` discipline is applied where it matters for capacity: the seat count in [`handlers/license.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L288) correctly counts only live rows:

```ts
// site/workers/src/handlers/license.ts:288
`SELECT COUNT(*) as count FROM machines WHERE license_id = ? AND is_active = 1`,
```

But when the CLI calls `validate-license` with a `machine_id` that already has a row, the lookup selects that row **without any state filter**:

```ts
// site/workers/src/handlers/license.ts:253-258
const existingRow = yield* queryFirst(
  env.DB,
  `SELECT id FROM machines WHERE license_id = ? AND machine_id = ?`,
  [license.id, machineId],
  'findMachine'
);
if (existingRow !== null) {
  const existing = yield* decodeRow(
    ExistingMachineRowSchema,
    ...
```

Because `existingRow !== null` short-circuits the flow before the seat-count query at line 288 is ever reached, a row with `is_active = 0` takes the "known machine" path: `last_seen_at` is touched and `registerOrTouchMachine` returns success. `validateLicense` then proceeds unconditionally to mint a fresh JWT (7-day expiry, full tier/features claims). There is no gate anywhere on the revoked→valid transition — the terminal state of the lifecycle is not terminal.

A secondary defect compounds this: the `revoked_at` column exists in the schema but **no handler ever writes it**. The PoC confirmed this directly:

```
p10-012 step2: revoke endpoint success=true; db truth: is_active=0 revoked_at=null
```

## Root Cause

A missing `AND is_active = 1` predicate in the existing-machine lookup at [`site/workers/src/handlers/license.ts:255`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L255), combined with no downstream check of `is_active` on that path. The sibling seat-count query at line 288 applies the filter correctly, which creates a false assurance of consistent enforcement — but the two queries serve different purposes, and only the unfiltered one gates re-validation.

This class of defect (missing WHERE predicate on a state read) is invisible to taint tracking and pattern-based SAST rules.

## Proof of Concept (PoC)

The full exploit script is at [`piolium/findings/p10-012-revoked-machine-resurrection/poc.sh`](piolium/findings/p10-012-revoked-machine-resurrection/poc.sh), which runs the vitest-based PoC ([`poc.test.ts`](piolium/findings/p10-012-revoked-machine-resurrection/poc.test.ts)) against the real Worker running in workerd via the `@cloudflare/vitest` pool, backed by a local D1 database with production migrations applied. Revocation is performed through the real authenticated `POST /api/machines/revoke` handler, not by direct DB manipulation.

Attack sequence:

1. Activate machine `victim-machine-dashboard-revoked` normally on a pro license with `max_machines = 1`. Result: valid, signed JWT issued.
2. Revoke the machine through the dashboard endpoint. Result: `success=true`, DB truth becomes `is_active=0`.
3. Call `POST /api/validate-license` again with the same license key + `machine_id`, then attempt to activate a second distinct machine (`attacker-second-freebie-machine`) on the same max_machines=1 license.

Decisive output from the executed run ([`evidence/exploit.log`](piolium/findings/p10-012-revoked-machine-resurrection/evidence/exploit.log)):

```
p10-012 step1: initial activation valid=true tier=pro max_machines=1 jwt_mid=victim-machine-dashboard-revoked
p10-012 step2: revoke endpoint success=true; db truth: is_active=0 revoked_at=null
p10-012 RESURRECTION: revoked machine re-validated valid=true fresh_signed_jwt=yes jwt_mid=victim-machine-dashboard-revoked jwt_validity_days=7 tier=pro features=8
p10-012 SEAT-FREED: second distinct machine activation valid=true while revoked machine still holds a valid JWT (max_machines=1)
p10-012 db-truth: [{"machine_id":"attacker-second-freebie-machine","is_active":1},{"machine_id":"victim-machine-dashboard-revoked","is_active":0}]
```

Final database truth shows the paradox clearly: two distinct machines hold valid status on a one-seat license, one of them flagged as revoked yet still served.

## Impact

All observed behavior below was captured in the executed PoC; downstream business consequences are inference.

- **Observed:** a dashboard-revoked machine immediately re-validates and receives a fresh HS256-signed offline license JWT valid for 7 days with the full tier (`pro`) and feature set (`features=8`). The operator's revoke action does not stop the CLI.
- **Observed:** the revoked row's seat is freed by the seat-count query (which counts only `is_active = 1`), allowing a second distinct machine to activate concurrently on a `max_machines = 1` license while the "revoked" machine keeps working. One paid seat effectively becomes two.
- **Inferred:** any customer (or anyone holding a leaked license key + machine ID pair) can indefinitely defeat revocation by periodically calling validate-license, converting every dashboard revocation into a no-op. This undermines the entire entitlement model: per-seat revenue can be diluted arbitrarily, and abuse reports / chargebacks cannot be enforced by deprovisioning a device. Because the minted JWTs are offline-valid for 7 days, even fixing the server later leaves a window during which previously-minted tokens keep working.

## Remediation

1. Add `AND is_active = 1` to the existing-machine lookup in `registerOrTouchMachine` (`site/workers/src/handlers/license.ts:255`) so an inactive match falls through to the seat-count path, and explicitly reject (or apply product-defined reactivate policy) when the matched row is inactive rather than silently treating it as new.
2. Write `revoked_at = CURRENT_TIMESTAMP` in all three revoke handlers (`dashboard.ts:130`, `dashboard.ts:191`, `dashboard.ts:574`) so revocation bookkeeping is auditable; currently the column is never populated.
3. Consider shortening offline JWT validity or embedding a license-level revocation epoch checked at mint time, to bound the window for already-issued tokens after a future fix.

Confirm-Timestamp: 2026-08-23T09:08:57Z
Confirm-Evidence: piolium/findings/p10-012-revoked-machine-resurrection/evidence/confirmed-20260823T090857Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:20:02Z
Confirm-Evidence: piolium/findings/p10-012-revoked-machine-resurrection/evidence/confirmed-20260823T091747Z-v2.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: variant 2 (adapted copy with the cosmetic healthcheck vitest pre-run stripped to fit the 30s variant budget) - revoked machine re-validated valid=true with fresh_signed_jwt=yes AND freed seat let a second distinct machine activate on max_machines=1 license; vitest rc=0 against real worker.fetch in workerd
