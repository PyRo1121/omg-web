# [MEDIUM] Find-or-Create Customer Race Creates Duplicate Identity Rows (No UNIQUE Constraint on `customers.email`)

**Severity:** Medium
**Vulnerability class:** Race condition / TOCTOU in identity provisioning (CWE-362, CWE-367)
**Status:** Confirmed — PoC executed against the real worker in workerd with real D1 migrations

## Summary

Three independent code paths implement find-or-create on the `customers` table as a SELECT-then-INSERT pair with no enclosing transaction, and the D1 schema has **no UNIQUE constraint on `customers.email`**. Two concurrent requests for the same email — e.g., two parallel `POST /api/auth/verify-code` calls for one identity, or a Stripe webhook racing a browser login — both observe "missing" inside the inter-request window and both INSERT, producing two `customers` rows for one identity. Because every downstream email-keyed operation binds to an arbitrary row (`WHERE email = ? ... .first()`), sessions, free licenses, the `admin` flag, and Stripe linkage can land on *different* rows, permanently fragmenting the identity: there is no merge logic anywhere in the repository.

## Details

The schema in [site/workers/migrations/0000_current_baseline.sql](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/migrations/0000_current_baseline.sql#L298-L309) defines the `customers` table with only an `id` primary key and a UNIQUE index on `stripe_customer_id` — `email` is plain `TEXT NOT NULL`, so duplicate emails are accepted silently:

```sql
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  email TEXT NOT NULL,
  company TEXT,
  tier TEXT DEFAULT 'free',
  admin INTEGER DEFAULT 0,
  telemetry_opt_out INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

All three find-or-create implementations follow the same non-atomic pattern. The OTP verification path in [`findOrCreateCustomer`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L270-L303) first reads:

```ts
const existing = yield* Effect.tryPromise({
  try: () =>
    db.prepare(`SELECT id, email, company FROM customers WHERE email = ?`).bind(email).first(),
  catch: cause => new AuthStoreUnavailable('findCustomer', cause),
})
```

and then, when no row is found, inserts unconditionally as three separate D1 statements (customer insert plus license insert) with no transaction, no `db.batch`, and no conditional insert:

```ts
if (existing !== null) {
  return existing;
}
const customerId = brandGeneratedId(CustomerId, crypto.randomUUID());
yield* Effect.tryPromise({
  try: () =>
    db
      .prepare(`INSERT INTO customers (id, email, tier) VALUES (?, ?, 'free')`)
      .bind(customerId, email)
      .run(),
  catch: cause => new AuthStoreUnavailable('insertCustomer', cause),
});
```

The identical SELECT-then-INSERT shape exists in [`site-session.ts`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/site-session.ts#L54-L81) (`mintSiteSession`, triggered by BFF `/api/licensing/*` traffic) and [`stripe-reconciliation.ts`](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/stripe-reconciliation.ts#L110-L131) (Stripe webhook reconciliation).

D1 serializes individual statements but provides no atomicity across this multi-round-trip read-then-write window. If two requests execute their SELECTs before either INSERT commits, both see "missing" and both insert distinct customer IDs under the same email. No lock primitive or idempotency guard prevents this.

## Root Cause

A classic TOCTOU flaw: find-or-create is implemented as two round-trips without a database-level uniqueness backstop. The correct invariant — at most one `customers` row per email — is enforced nowhere: not by the schema (no UNIQUE index), not by the application (no transaction, no `INSERT ... ON CONFLICT`), and not by any lock. Any concurrency across the three call sites can therefore violate the single-identity assumption that all other email-keyed queries implicitly rely on.

## Proof of Concept (PoC)

PoC status: **executed** against the production handler chain (`site/workers/src/worker.ts`) in workerd via `@cloudflare/vitest-pool-workers`, with local D1 bound as `DB` and the project's real migrations applied. The runnable script is at `piolium/findings/p10-011-customer-find-or-create-duplicate-race/exploit.sh` (test source: `poc.test.ts`; raw output: `evidence/exploit.log`, `evidence/impact.log`).

Steps:

1. Seed two independently claimable OTP codes for one fresh email directly into `auth_codes` (HMAC digests computed locally; both codes are legitimate outputs of two send-code emails).
2. Fire two concurrent `POST /api/auth/verify-code` requests to the real worker, each consuming one valid code for the same email.
3. Query the `customers` table by email.

Decisive evidence lines from `evidence/exploit.log`:

```
P10_011 round=0 statusA=200 statusB=200 okA=true okB=true customerRows=2 customerIds=["cc9d235d-101b-4017-be1b-3d5f4726a4ed","e8ea5f2d-98a2-49d2-92c9-7fc06fd7994e"] sessionCustomerIds=["cc9d235d-101b-4017-be1b-3d5f4726a4ed","e8ea5f2d-98a2-49d2-92c9-7fc06fd7994e"]
P10_011_RESULT reproduced round=0 duplicate_customer_ids=["cc9d235d-101b-4017-be1b-3d5f4726a4ed","e8ea5f2d-98a2-49d2-92c9-7fc06fd7994e"] session_customer_fragments=["cc9d235d-101b-4017-be1b-3d5f4726a4ed","e8ea5f2d-98a2-49d2-92c9-7fc06fd7994e"]
```

Both concurrent verifications returned HTTP 200 with success, and the database ended up with **two customer rows for one email**, each carrying its own free license. A pre-run healthcheck confirmed the schema precondition (`[healthcheck] PASS: customers.email has no UNIQUE constraint`) while the full existing test suite stayed green (23 files / 184 tests), showing the duplication is invisible to current tests.

## Impact

Observed: duplicate identity rows with divergent IDs for a single email, created from ordinary user behavior (a double-clicked verify, or parallel dashboard requests) — no attacker privilege required.

Inferred consequences of the resulting identity fragmentation:

- **Session/license divergence:** each subsequent email-keyed lookup uses `.first()`, binding sessions and licenses to an arbitrary row. Role sync via `syncCustomerRole` updates only the row found by that request, so if Better Auth later grants admin, the Worker-side row serving the session may not be the row carrying `admin=1` (or vice versa) — breaking the invariant that role synchronization is total.
- **Stripe linkage corruption:** `UPDATE customers SET stripe_customer_id = ? WHERE email = ?` in the billing `customer.created` handler would attempt to link Stripe to *both* rows, but `stripe_customer_id` is UNIQUE, so one write fails mid-flow, leaving billing state inconsistent.
- **Persistence:** there is no deduplication or merge logic anywhere in the repository, so fragmentation is permanent until manually repaired.

Severity is measured as Medium rather than High because exploitation requires a timing window rather than a deterministic attacker primitive, and the immediate effect is data-integrity corruption rather than direct privilege escalation — though the broken role-sync invariant could amplify other findings.

## Remediation

1. Add a uniqueness backstop: `CREATE UNIQUE INDEX idx_customers_email ON customers(email)` (with a one-time dedup migration for any existing duplicate rows).
2. Convert all three find-or-create sites ([auth.ts](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L270-L303), [site-session.ts](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/site-session.ts#L54-L81), [stripe-reconciliation.ts](https://github.com/pyro1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/stripe-reconciliation.ts#L110-L131)) to single-statement atomic upserts — `INSERT INTO customers (...) VALUES (...) ON CONFLICT(email) DO NOTHING RETURNING *`, falling back to a re-SELECT on constraint violation.
3. Wrap multi-statement provisioning (customer + license) in `db.batch` so they commit atomically.

Confirm-Timestamp: 2026-08-23T09:08:57Z
Confirm-Evidence: piolium/findings/p10-011-customer-find-or-create-duplicate-race/evidence/confirmed-20260823T090857Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:19:38Z
Confirm-Evidence: piolium/findings/p10-011-customer-find-or-create-duplicate-race/evidence/confirmed-20260823T091826Z-v3.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: concurrent verify-code double-submit reproduced at round 0 - statusA=statusB=200, customers rows=2 with distinct ids and fragmented session identity (P10_011_RESULT reproduced); wrapper process hit the 30s variant cap after tests completed, so the final JSON verdict line was clipped - authoritative markers captured verbatim into the confirmed log from evidence/impact.log of the same run
