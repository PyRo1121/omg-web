# [MEDIUM] License Seat Limit Enforced with Non-Transactional Count-Then-Insert (TOCTOU Race)

**Vulnerability class:** Business-logic / concurrency (TOCTOU race condition)
**CWE:** CWE-367 (Time-of-check Time-of-use TOCTOU Race Condition)
**Severity:** Medium
**PoC status:** Executed against the real worker in workerd with production D1 migrations
**Affected endpoint:** `POST /api/validate-license` (`registerOrTouchMachine()` in `site/workers/src/handlers/license.ts`)

## Summary

The machine activation path in `registerOrTouchMachine()` enforces the per-license machine cap (`max_machines`) with a separate `SELECT COUNT(*)` followed by an `INSERT INTO machines`, with no transaction, no conditional insert, and no unique constraint covering distinct machine IDs. Because Cloudflare Workers handles requests concurrently, an attacker holding a single valid pro/team license key can fire N parallel `validate-license` activations with distinct `machine_id` values; every request observes the stale count before any peer's insert lands, so all N activations succeed and each returns a signed, offline-valid license JWT. In an executed PoC, a license with a paid limit of 2 machines ended up with **40 active machine rows and 40 granted JWTs** from a single concurrent burst.

## Details

The vulnerable code path is `registerOrTouchMachine()` in [`site/workers/src/handlers/license.ts`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L285-L316). The seat-limit check and the seat consumption are two independent D1 round-trips:

```ts
const countRow = yield* queryFirst(
  env.DB,
  `SELECT COUNT(*) as count FROM machines WHERE license_id = ? AND is_active = 1`,
  [license.id],
  'countMachines'
);
// ...
const maxMachines = maxMachinesFor(license);
if (count >= maxMachines) {
  return {
    valid: false as const,
    error: `Machine limit reached (${maxMachines}). Revoke a machine in your dashboard or upgrade.`,
  };
}

yield* runSql(
  env.DB,
  `INSERT INTO machines (id, license_id, machine_id, user_name, user_email, is_active)
   VALUES (?, ?, ?, ?, ?, 1)`,
  [crypto.randomUUID(), license.id, machineId, body.userName, body.userEmail],
  'insertMachine'
);
```

Three independent facts make this racy in production:

1. **No transaction wraps the check and the insert.** Between the `SELECT COUNT(*)` and the `INSERT`, other concurrent requests can commit their own inserts. Every racing request reads the same pre-insert count.
2. **The existing `UNIQUE(license_id, machine_id)` constraint does not help.** It only rejects duplicate machine IDs; each racing request supplies a fresh, distinct `machine_id`, so every insert succeeds.
3. **The endpoint is anonymous to the seat boundary.** `POST /api/validate-license` requires only a valid `license_key` — i.e., the license holder themselves (or anyone who has obtained the key) is the attacker, and the attack needs no privileged access.

The codebase already demonstrates the correct atomic pattern elsewhere — the OTP claim path uses a single conditional `UPDATE ... RETURNING id` statement (see [`src/handlers/auth.ts`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L345)) — but that pattern was not applied to machine registration.

## Root Cause

A time-of-check/time-of-use race: the seat-limit policy is evaluated on data (`SELECT COUNT(*)`) that is read in a separate round-trip from the state mutation (`INSERT`) that the policy is supposed to gate. There is no transaction, no atomic conditional insert (e.g. `INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < ?` with a post-check on `changes()`), and no unique constraint that covers the racing case (distinct machine IDs). Concurrency is the normal operating mode of a Workers deployment, so the race does not require cross-region timing — it reproduces within a single isolate.

## Proof of Concept (PoC)

The PoC script at `piolium/findings/p10-010-license-seat-limit-toctou-race/poc.sh` runs `poc.test.ts` against the **real worker** (`site/workers/src/worker.ts`) in workerd via the `@cloudflare/vitest` pool, against a local D1 database seeded with the production migrations. A pro license is seeded with `max_machines = 2`.

1. **Control (sequential):** four *sequential* activations with distinct machine IDs produce `[valid, valid, denied, denied]` — the cap holds when requests are serialized:
   ```
   p10-010 control #0: valid=true
   p10-010 control #1: valid=true
   p10-010 control #2: valid=false error="Machine limit reached (2). Revoke a machine in your dashboard or upgrade."
   p10-010 control #3: valid=false error="Machine limit reached (2). Revoke a machine in your dashboard or upgrade."
   ```
2. **Exploit (concurrent):** 40 *concurrent* activations of the same license, each with a fresh `machine_id`, dispatched via `Promise.all` through `worker.fetch`. Decisive output (from `piolium/findings/p10-010-license-seat-limit-toctou-race/evidence/exploit.log`):
   ```
   p10-010 burst: 40/40 activations returned valid=true + signed JWT (max_machines=2); denied=0
   p10-010 JWT mid claims bound to distinct machines: race-machine-0, race-machine-1, race-machine-2, race-machine-3, race-machine-4 ...
   p10-010 DB truth: active machines for license after burst = 40 (paid limit: 2)
   ```

Ground truth was read directly from D1 after the burst: 40 active machine rows for one license whose paid cap is 2, and every granted response contained a signed JWT with a `mid` claim bound to a distinct machine.

## Impact

**Observed:** a single pro license with a paid limit of 2 machines registered 40 active machines and received 40 signed, machine-bound license JWTs from one concurrent burst — a direct, reproducible seat-limit bypass requiring nothing more than the license key the attacker already holds.

**Inferred:** because each granted JWT is valid offline for 7 days, the bypass converts directly into revenue loss (one paid seat effectively unlocks unlimited activations) and corrupts the admin CRM machine lists, inflating reported seat usage. The attack is trivially automatable and leaves no anomaly other than extra machine rows. The same license holder is the natural actor, so this crosses a monetization/business-logic boundary rather than a confidentiality or privilege boundary — consistent with the Medium rating.

## Remediation

Enforce the seat limit atomically. Recommended options, in order of preference:

1. **Conditional insert:** replace the count-then-insert pair with a single statement, e.g.
   `INSERT INTO machines (...) SELECT ... WHERE (SELECT COUNT(*) FROM machines WHERE license_id = ? AND is_active = 1) < ?` and reject when `changes()` is 0.
2. **Batched transaction:** wrap the `SELECT COUNT(*)` and `INSERT` in `env.DB.batch([...])` so they commit atomically.
3. **Slot tokens / unique seat index:** add a `seat_number` column with `UNIQUE(license_id, seat_number)` and allocate seats via `INSERT OR FAIL`, retrying on conflict.

The atomic single-statement pattern already used for OTP claiming in `src/handlers/auth.ts` is the in-repo precedent to follow.

Confirm-Timestamp: 2026-08-23T09:08:57Z
Confirm-Evidence: piolium/findings/p10-010-license-seat-limit-toctou-race/evidence/confirmed-20260823T090857Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:12:58Z
Confirm-Evidence: piolium/findings/p10-010-license-seat-limit-toctou-race/evidence/confirmed-20260823T091232Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: D1 contains 40 active machine rows for one pro license whose paid max_machines=2, after a single concurrent burst of validate-license calls that granted 40 signed offline-valid JWTs
