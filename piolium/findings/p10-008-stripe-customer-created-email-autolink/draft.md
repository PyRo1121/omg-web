---
id: p10-008
phase: P10
sequence: 8
slug: stripe-customer-created-email-autolink
status: valid
verdict: VALID
severity: medium
title: Stripe customer.created webhook auto-links local accounts by bare email match
original: p4-002-stripe-customer-created-email-autolink.md
debate: piolium/chamber-workspace/C3-cross-account-enumeration/debate.md
---

## Summary

The `customer.created` webhook branch performs:

```sql
SELECT id, stripe_customer_id FROM customers WHERE stripe_customer_id = ? OR email = ?
```

and, when an existing local row has `stripe_customer_id IS NULL`:

```sql
UPDATE customers SET stripe_customer_id = ? WHERE email = ?
```

The matching key is the Stripe event's `email` field — attacker-influenced content
inside a correctly-signed webhook. Anyone can cause Stripe to emit `customer.created`
bearing an arbitrary email (e.g., starting checkout via payment link or another
channel and entering a victim's email address). The signature proves the event came
from Stripe; it says nothing about who controls that email address.

## Impact

An attacker who knows a victim's signup email binds their own Stripe customer id to
the victim's local account. Subsequent subscription/invoice events reconcile against
the linked `stripe_customer_id` → victim's customer row:

1. **Entitlement manipulation**: cancelling or disputing the attacker's own
   subscription projects `free`/canceled tier onto the victim's paid account.
2. **Data pollution**: attacker-controlled invoices/subscriptions render inside the
   victim's dashboard billing views.
3. **Pre-account bind**: for victims not yet Stripe-linked, the attacker establishes
   persistent linkage ahead of the legitimate owner.

## Preconditions

- Knowledge of the victim's email (public in many OSS contexts).
- Victim's local row must have `stripe_customer_id IS NULL`.
- One attacker purchase interaction (can be refunded).

## Recommended direction

Only auto-create/link when the email is verified by Stripe
(`email_verified`) or when the linkage was initiated by an authenticated session from
the local side (e.g., checkout created with `customer_email` from the session).
Require re-confirmation before linking an existing local account.

## Classification

Likely security (cross-user trust-boundary crossing via signed-but-attacker-shaped
event payload).

## PoC Metadata

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
PoC-Script: poc.py (driver exploit.sh; provisioning setup.sh)
Evidence: evidence/setup.log, evidence/healthcheck.log, evidence/exploit.log, evidence/impact.log, evidence/env-info.txt

Executed against the production Worker source in workerd (`wrangler dev`, local D1,
migrations applied). Control first proves the signature gate is intact (unsigned
webhook -> 400); the PoC then delivers a correctly-signed `customer.created` event
whose `email` field is attacker-chosen — byte-for-byte what Stripe emits when an
attacker enters the victim's email at checkout — and the handler binds the attacker's
`stripe_customer_id` onto the victim's local row (billing.ts UPDATE ... WHERE email = ?).
A follow-up signed `invoice.paid` for the attacker's Stripe customer was projected into
the victim's invoices table, demonstrating cross-account billing-record pollution and
the entitlement-manipulation path.
