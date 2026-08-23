---
id: p10-013
phase: P10
sequence: 13
slug: stripe-projection-stale-write
status: valid
verdict: VALID
severity: medium
title: Stripe entitlement projection serialized per-event only — concurrent events can persist a stale subscription snapshot
original: p6-004-stripe-projection-stale-write.md
debate: piolium/chamber-workspace/C4-concurrency-state-machine/debate.md
---

## Summary

The `stripe_events` inbox (`claimStripeEvent`, billing.ts) serializes retries of the *same* event id, but two **different** events touching the same customer/subscription are processed concurrently — each claims its own inbox row and both run fetch-then-project against live D1. The reconcile-from-source pattern re-fetches the subscription from Stripe before projecting, which defeats replay/order spoofing of event bodies but does NOT defeat interleaving: worker A (older signal) and worker B (newer signal) both fetch, B projects the newer state, then A commits its older fetched snapshot last — the database ends up asserting a state Stripe no longer has. Entitlement columns (`customers.tier`, `licenses.status`) stay wrong until an unrelated future event happens to overwrite them; meanwhile `validate-license` honors `licenses.status`/`tier` directly, so a cancelled/downgraded customer keeps pro seats, or a paying customer is locked out.

## Evidence

- Entity schema: `licenses.status TEXT DEFAULT 'active'`, `customers.tier` (`0000_current_baseline.sql:478-491`, `:298-308`)
- Code path (read): `stripe-reconciliation.ts:44-56` — `currentStripeSubscription()` HTTP GET snapshot
- Code path (write): `stripe-reconciliation.ts:213-231` — `UPDATE licenses SET tier=?, status='active', ... WHERE customer_id = ?` inside `db.batch`
- Enclosing transaction: yes per-projection (`db.batch` is atomic in D1) but atomicity ≠ ordering — no version/staleness guard, no compare-and-set on `updated_at` or period end
- Lock primitive: inbox claim covers same-event-id only (`billing.ts:claimStripeEvent`); cross-event concurrency unguarded
- Aggravator: admin's manual `UPDATE licenses SET tier=? / SET status=? WHERE customer_id = ?` (`admin.ts:769-775`) is another unsynchronized writer to the same columns — any late webhook silently clobbers manual support overrides with no audit of the loss

## Attack Steps

1. Customer cancels then immediately re-subscribes (or support manually downgrades while a queued `subscription.updated` from earlier is still being delivered/retried by Stripe).
2. Stripe delivers both events near-simultaneously; both pass signature verification and claim distinct inbox rows.
3. Interleaving where the stale snapshot's batch commits last leaves `customers.tier='pro'` / `licenses.status='active'` although Stripe's current state says otherwise. No error, no log — silent divergence between billed state and granted entitlements.

## Why This Passed SAST

The code looks defensive (signature check, inbox dedup, fetch-before-project); the residual bug lives purely in commit-ordering of two legitimate concurrent executions.

## Recommended Fix

Add a monotonic guard before projecting: skip when the stored row already reflects a newer observation (compare `current_period_end` / `subscriptions.updated_at` or a stored `last_projected_event_created`), or serialize projections per `customer_id` via a D1 lease row analogous to the existing 5-minute processing lease.

---

PoC-Status: executed
Protocol: local
Auth-Required: no
Auth-Roles-Required: anonymous
