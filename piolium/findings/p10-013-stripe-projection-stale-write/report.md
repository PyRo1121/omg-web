# [M1] Stripe entitlement projection is serialized per-event only — concurrent webhook events can persist a stale subscription snapshot

**Severity:** Medium
**Vulnerability class:** Race condition / lost update in billing state projection
**CWE:** CWE-367 (Time-of-check Time-of-use) / CWE-362 (Race Condition)
**PoC status:** Executed (real workerd + D1 via `@cloudflare/vitest-pool-workers`)

## Summary

The Stripe webhook handler claims each incoming event id into a `stripe_events` inbox before processing, which correctly serializes retries of the *same* event. However, two **different** Stripe events that touch the same customer or subscription are claimed independently and processed concurrently. Each concurrent worker re-fetches the subscription from the live Stripe API and then projects the fetched snapshot into D1 (`customers.tier`, `licenses.status`, `subscriptions`). Because there is no version, timestamp, or per-customer ordering guard on the projection write, an older worker can commit its stale snapshot *after* a newer worker has already committed — leaving the database asserting entitlements that contradict Stripe's current billing state. A cancelled customer keeps Pro access indefinitely (or a paying customer is locked out by the reverse interleaving), until some unrelated future event happens to re-project the row.

## Details

The handler processes webhooks through two stages:

1. **Claim** — [`claimStripeEvent` in `site/workers/src/handlers/billing.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/billing.ts#L193-L227) inserts the event into `stripe_events` with `INSERT OR IGNORE`, then attempts a conditional claim:

   ```ts
   const claim = await db
     .prepare(
       `UPDATE stripe_events
        SET status = 'processing', attempt_count = attempt_count + 1,
            processing_started_at = CURRENT_TIMESTAMP, last_error = NULL
        WHERE stripe_event_id = ? AND (
          status IN ('received', 'failed') OR
          (status = 'processing' AND processing_started_at < datetime('now', '-5 minutes'))
        )`
     )
     .bind(event.id)
     .run();
   ```

   The uniqueness key here is `stripe_event_id`. Two distinct events (`evt_cancel_...` and `evt_resubscribe_...`) both pass signature verification and both successfully claim their own inbox rows — this lock provides no cross-event serialization for the same customer.

2. **Reconcile** — each worker then runs the reconcile-from-source path: [`currentStripeSubscription` in `site/workers/src/stripe-reconciliation.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/stripe-reconciliation.ts#L44-L56) issues an HTTP GET against `https://api.stripe.com/v1/subscriptions/{id}` to obtain a fresh snapshot, defeating replay/order spoofing of event bodies.

The projection itself writes entitlement columns unconditionally inside a per-projection `db.batch` ([`site/workers/src/stripe-reconciliation.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/stripe-reconciliation.ts#L213-L231)):

```ts
statements.push(
  db
    .prepare(
      `UPDATE licenses
       SET tier = ?, status = 'active', max_seats = ?, max_machines = ?,
           expires_at = datetime(?, 'unixepoch')
       WHERE customer_id = ?`
    )
    .bind(
      entitlement.tier,
      entitlement.maxSeats,
      entitlement.maxSeats,
      subscription.current_period_end,
      customerId
    ),
```

Each `db.batch` is atomic in D1, but atomicity is not ordering: nothing compares `subscription.current_period_end` (or the subscription's `updated_at`) against what is already stored before overwriting. When the workers interleave such that worker A fetches an old snapshot, worker B fetches and commits a newer snapshot, and then worker A's batch commits last, the database ends up reflecting the *older* observation of Stripe state. The same unguarded columns are also written by the admin manual-override endpoint ([`site/workers/src/handlers/admin.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/admin.ts#L769-L775)), so any late-arriving webhook silently clobbers support-applied overrides as well:

```ts
if (body.tier) {
  await env.DB.prepare(`UPDATE licenses SET tier = ? WHERE customer_id = ?`)
    .bind(body.tier, body.userId)
    .run();
}
```

Downstream, the `validate-license` handler trusts `licenses.status` / `licenses.tier` directly, so whatever stale values survive the race become authoritative for license validation.

## Root Cause

The inbox lease serializes only retries of a single event id; there is no synchronization primitive spanning different events that affect the same `customer_id`. Combined with a fetch-then-project pattern whose final write has no monotonicity guard (no compare-and-set on `current_period_end`, no stored `last_projected_event_created`), concurrent legitimate deliveries can commit snapshots out of order, and the last writer wins regardless of whether its observation is the newest.

## Proof of Concept (PoC)

The PoC driver is [`poc.sh`](poc.sh), which runs [`poc.test.ts`](poc.test.ts) under `@cloudflare/vitest-pool-workers`: it executes the real `handleStripeWebhook` handler inside workerd against a real D1 binding, delivering two distinct signed subscription events concurrently (a cancellation followed immediately by the stale worker committing last). Stripe API responses are controlled via an in-process `stripeFetch` stub to force the losing interleaving — no live Stripe account or network is required.

Steps:

1. Seed a customer with an active Pro subscription.
2. Deliver event B (cancellation): worker B fetches the live snapshot showing `status = 'canceled'`.
3. Interleave event A (older signal, e.g. a prior renewal) so that worker A's fetch happens before B's commit but A's projection batch commits after B's.
4. Read back the D1 rows and call the real `/validate-license` endpoint.

Observed result (from [`evidence/exploit.log`](evidence/exploit.log) and [`evidence/impact.log`](evidence/impact.log)):

```
[poc] final DB state: {"customer_tier":"pro","license_tier":"pro","license_status":"active","subscription_status":"active"}
[poc] validate-license response: {"valid":true,"tier":"pro","max_machines":3,"features":["packages","runtimes","container","env-capture","env-share","sbom","audit","secrets"],"customer":"victim@example.com",...}
```

Immediately before the stale commit, the database correctly showed the cancellation (`license_status":"cancelled"`, `customer_tier":"free"`); the stale worker's late batch reverted all four rows to the pre-cancellation snapshot, and `validate-license` minted a valid Pro JWT from the stale row.

## Impact

- **Entitlement divergence from billed state.** A customer who cancels at Stripe retains Pro entitlements (`customers.tier = 'pro'`, `licenses.status = 'active'`) until some unrelated future Stripe event happens to re-project the row — potentially indefinitely. This is demonstrated revenue loss, not hypothetical: the executed PoC shows `validate-license` returning `valid: true, tier: "pro"` for a subscription Stripe reports as canceled.
- **Reverse direction: paying customers locked out.** The symmetric interleaving (a downgrade/renewal snapshot committing over a newer upgrade) locks out a paying customer or strips seats/machine limits they paid for, generating support burden.
- **Silent, unaudited failure.** No error is thrown and no log records the overwrite; the divergence is invisible until noticed operationally.
- **Admin overrides clobbered.** Manual support fixes via the admin tier/status updates are ordinary unsynchronized writers to the same columns, so any queued or retried webhook can silently undo them.

Exploitation does not require an attacker-controlled input path — the trigger is ordinary near-simultaneous delivery of legitimate Stripe events (cancel + immediate resubscribe, plan change during retry backoff), plus Stripe's at-least-once delivery semantics. An attacker who controls the timing of their own subscription changes (cancel/resubscribe rapidly) can deliberately induce the favorable interleaving.

## Remediation

Add a monotonic guard before projecting, or serialize projections per customer:

1. **Version-guard the write (preferred):** before the projection `db.batch`, compare the fetched snapshot's `current_period_end` / subscription `updated_at` against the stored row and skip the write when the stored row already reflects a newer observation (conditional `UPDATE ... WHERE current_period_end <= ?`).
2. **Per-customer lease:** serialize reconciliation per `customer_id` using a D1 lease row analogous to the existing 5-minute `processing_started_at` lease in `stripe_events`.
3. **Record provenance:** store the projected event id/timestamp on the row so both webhook projections and admin overrides are comparable and auditable, preventing silent clobbering in either direction.

Confirm-Timestamp: 2026-08-23T09:08:57Z
Confirm-Evidence: piolium/findings/p10-013-stripe-projection-stale-write/evidence/confirmed-20260823T090857Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:15:28Z
Confirm-Evidence: piolium/findings/p10-013-stripe-projection-stale-write/evidence/confirmed-20260823T091505Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: cancelled Stripe subscription reverted to pro/active by stale concurrent projection; validate-license mints Pro JWT from stale licenses row
