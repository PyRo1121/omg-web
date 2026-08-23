---
id: p10-011
phase: P10
sequence: 11
slug: customer-find-or-create-duplicate-race
status: valid
verdict: VALID
severity: medium
title: Find-or-create customer race creates duplicate identity rows (no UNIQUE on customers.email) [downgraded HIGH→MEDIUM]
original: p6-001-customer-find-or-create-duplicate-race.md
debate: piolium/chamber-workspace/C4-concurrency-state-machine/debate.md
---

## Summary

Three independent code paths implement find-or-create on `customers` as SELECT-then-INSERT with no enclosing transaction, and the schema has **no UNIQUE constraint on `customers.email`** (only `id` PK and `stripe_customer_id` UNIQUE). Two concurrent requests for the same email — e.g., double-clicked OTP verify, parallel BFF `/api/licensing/*` calls each triggering `mintSiteSession`, or a Stripe webhook racing a browser login — both observe "missing" and both INSERT, producing two customer rows for one identity. Downstream every email-keyed operation (`WHERE email = ? ... .first()`) binds to an arbitrary row, so sessions, free licenses, `admin` flag sync, and Stripe linkage can land on *different* rows. This fragments identity permanently: there is no merge logic anywhere in the repo.

## Evidence

- Entity schema: `customers.email TEXT NOT NULL` — no UNIQUE (`0000_current_baseline.sql:298-308`)
- Code path (read): `auth.ts:280` — `SELECT id, email, company FROM customers WHERE email = ?`
- Code path (write): `auth.ts:299` — `INSERT INTO customers (id, email, tier) VALUES (?, ?, 'free')`; same pattern at `site-session.ts:81` and `stripe-reconciliation.ts:126-129`
- Enclosing transaction: no — three separate D1 statements, no `db.batch`, no conditional insert (`INSERT ... WHERE NOT EXISTS`)
- Lock primitive: absent; D1 serializes statements but not across this multi-round-trip window

## Attack Steps

1. Attacker (or simply an unlucky double-submit) fires two concurrent `POST /api/auth/verify-code` with the same valid OTP, or two dashboard requests racing `mintSiteSession`.
2. Both `SELECT`s return null inside the inter-request window → both INSERT → duplicate rows.
3. Expected: one customer row. Actual: two rows. Subsequent `syncCustomerRole` (`site-session.ts`) updates only the row found by that request; if Better Auth later grants admin, the Worker-side row carrying the session may not be the row carrying `admin=1` (or vice versa) — breaking the CFD-1 invariant that role sync is total. `UPDATE customers SET stripe_customer_id = ? WHERE email = ?` (`billing.ts` customer.created handler) would link Stripe to *both* rows while `stripe_customer_id` UNIQUE makes one write fail mid-flow.

## Why This Passed SAST

The bug is the absence of a schema constraint plus temporal interleaving of two statements; both are invisible to syntactic rules.

## Recommended Fix

Add `CREATE UNIQUE INDEX idx_customers_email ON customers(email)` and convert all three sites to atomic `INSERT ... ON CONFLICT(email) DO NOTHING ... RETURNING` (or catch constraint violation and re-select), making find-or-create single-statement.

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
