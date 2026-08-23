# Stripe `customer.created` webhook auto-links local accounts by bare email match

**Severity:** Medium
**Vulnerability class:** Cross-account account linkage / trust-boundary violation via attacker-influenced webhook payload
**CWE:** CWE-284 (Improper Access Control) / CWE-345 (Insufficient Verification of Data Authenticity)
**PoC status:** Executed (real-environment run against the production Worker in `workerd` with local D1)

## Summary

The `customer.created` branch of the Stripe webhook handler in [`site/workers/src/handlers/billing.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/billing.ts) matches incoming events against local customer rows using a **bare, unverified email match**, and when an existing local row has no Stripe binding yet it writes the event's Stripe customer id onto that row:

```sql
SELECT id, stripe_customer_id FROM customers WHERE stripe_customer_id = ? OR email = ?
-- then, if the row exists but stripe_customer_id IS NULL:
UPDATE customers SET stripe_customer_id = ? WHERE email = ?
```

The matching key is the `email` field **inside the webhook event body**. A valid Stripe signature proves only that the event was delivered by Stripe — it says nothing about who controls the email address in the payload. Anyone can cause Stripe to emit a correctly-signed `customer.created` event bearing an arbitrary email (e.g., by starting a checkout or payment-link purchase and typing the victim's email address). The handler will then bind the attacker's Stripe customer id onto the victim's local account.

Once bound, all subsequent subscription/invoice webhooks for the attacker's Stripe customer reconcile against the victim's local row — enabling entitlement manipulation and billing-record pollution. This was confirmed end-to-end by an executed PoC (see below).

## Details

Stripe delivers `customer.created` whenever a new Stripe Customer object is created — including at the start of a Checkout Session or payment-link flow where the *buyer* types any email address they like. That email is entirely attacker-chosen content inside an otherwise legitimately-signed delivery.

The handler at [`billing.ts:600-650`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/billing.ts) processes such events as follows:

```ts
case 'customer.created': {
  const stripeCustomer = event.data.object;
  if (!stripeCustomer.email) {
    break;
  }

  // Check if customer already exists
  const existingRow = await env.DB.prepare(
    'SELECT id, stripe_customer_id FROM customers WHERE stripe_customer_id = ? OR email = ?'
  )
    .bind(stripeCustomer.id, stripeCustomer.email)
    .first();
  ...
  } else if (!existing.stripe_customer_id) {
    // Link existing customer to Stripe
    await env.DB.prepare(`UPDATE customers SET stripe_customer_id = ? WHERE email = ?`)
      .bind(stripeCustomer.id, stripeCustomer.email)
      .run();
  }
  break;
}
```

Two flaws combine here:

1. **Identity assumption from unverified data.** The `email` field of a Stripe customer object is free-text input from whoever created the checkout session. It is never checked against a Stripe-verified marker (e.g., `email_verified`) nor reconciled with an authenticated local session.
2. **Silent auto-linking of pre-existing rows.** If a local `customers` row already exists for that email but has `stripe_customer_id IS NULL`, the handler overwrites its binding to point at whatever Stripe customer id arrived in the event. No confirmation step is required on either side.

Downstream handlers compound the problem: e.g., the invoice projection path at [`billing.ts:684`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/billing.ts) resolves invoice ownership with the same `WHERE stripe_customer_id = ? OR email = ?` pattern, so every later billing event for the attacker's Stripe customer lands in the victim's records.

### Attack preconditions

- Attacker knows the victim's signup email (often public, e.g., OSS contributors).
- Victim's local row must not yet be Stripe-bound (`stripe_customer_id IS NULL`) — the common state before a user completes their first payment.
- One attacker-side purchase interaction (refundable), which causes Stripe to emit the signed event with the victim's email.

## Root Cause

The webhook handler treats the event body's `email` field as a trusted identity key. Signature verification (which the handler does perform correctly — unsigned deliveries are rejected with HTTP 400) authenticates the *sender* (Stripe), not the *subject* of the event. Auto-linking a pre-existing local account to an arbitrary Stripe customer id based solely on this field crosses a trust boundary: attacker-controlled input determines which local account receives the binding.

## Proof of Concept

The PoC script ([`poc.py`](poc.py), driver [`exploit.sh`](exploit.sh), provisioning [`setup.sh`](setup.sh)) runs against the production Worker source served by `wrangler dev` (workerd, local D1, migrations applied):

1. **Control:** POST `{}` to `/api/stripe/webhook` without a signature header → HTTP **400**, proving the signature gate is intact and nothing is bypassed.
2. Deliver a correctly-signed `customer.created` event whose `data.object.id` is the attacker's customer (`cus_attacker_p10_008_<ts>`) and whose `data.object.email` is the victim's email (`victim.p10-008@legist.test` — exactly what Stripe emits when an attacker types the victim's address at checkout) → HTTP 200.
3. Deliver a correctly-signed `invoice.paid` for the attacker's Stripe customer → HTTP 200.
4. Read back D1 state.

Decisive output from [`evidence/exploit.log`](evidence/exploit.log):

```
[*] Control: unsigned POST /api/stripe/webhook -> HTTP 400 (must be 4xx)
[*] Deliver signed customer.created (attacker cus_attacker_p10_008_1787471870, email=victim.p10-008@legit.test) -> HTTP 200: OK
[*] Deliver signed invoice.paid for attacker's customer -> HTTP 200: OK
[*] Victim row after attack: [{'id': 'victim-local-row-008', 'stripe_customer_id': 'cus_attacker_p10_008_1787471870', 'tier': 'pro'}]
[*] Invoices now attached to victim's customer id: [{'customer_id': 'victim-local-row-008', 'stripe_invoice_id': 'in_attacker_poc008', 'amount_cents': 66600}]
```

Note on methodology: the PoC signs requests with the merchant webhook secret, playing Stripe's delivery role. The signature scheme itself is not broken; the exploit rides a legitimately-signed delivery whose `email` field is the attacker-chosen input — byte-for-byte identical to real-world checkout abuse.

## Impact

Observed directly in D1 after the exploit ([`evidence/impact.log`](impact.log)):

```
customers (victim row BEFORE): id=victim-local-row-008 stripe_customer_id=NULL email=victim.p10-008@legit.test tier=pro
customers (victim row AFTER):
  id='victim-local-row-008'  stripe_customer_id='cus_attacker_p10_008_1787471870'  tier='pro'
invoices (victim billing records AFTER):
  customer_id='victim-local-row-008' stripe_invoice_id='in_attacker_poc008' amount_cents=66600
```

An attacker who knows a victim's signup email can:

1. **Bind their own Stripe customer id to the victim's account** — observed: the victim's row now carries the attacker's `stripe_customer_id`.
2. **Entitlement manipulation** (inferred from the reconciliation logic): subsequent `customer.subscription.*` / `invoice.*` events for the attacker's Stripe activity resolve against the victim's row. Cancelling or disputing the attacker's own subscription projects `free`/canceled tier onto the victim's paid (`pro`) account, degrading their access.
3. **Billing-record pollution** — observed: an invoice from the attacker's own Stripe activity (`in_attacker_poc008`, $666.00) was written into the victim's dashboard billing view.
4. **Persistent pre-account bind**: for victims not yet Stripe-linked, the attacker establishes the linkage ahead of the legitimate owner, hijacking their first real purchase reconciliation.

Severity is assessed as Medium rather than High because exploitation requires knowledge of the victim's email, the victim's row must be in the pre-bind (`NULL`) state, and primary damage is billing-state corruption/tier downgrade rather than authentication bypass.

## Remediation

- Do not auto-link a pre-existing local account based on the webhook email alone. Require the linkage to be initiated from an authenticated local session (e.g., create the Checkout Session with `customer_email` taken from the session identity and store the mapping server-side).
- Alternatively, only honor `customer.created` linking when Stripe reports the email as verified (`email_verified: true`), and require an explicit re-confirmation step (email to the account owner) before overwriting an existing row's `stripe_customer_id`.
- Prefer resolving ownership exclusively by `stripe_customer_id` established through authenticated flows; treat `OR email = ?` fallbacks in lookup queries (e.g., the invoice projection query) as untrusted matching keys.

Confirm-Timestamp: 2026-08-23T09:08:56Z
Confirm-Evidence: piolium/findings/p10-008-stripe-customer-created-email-autolink/evidence/confirmed-20260823T090856Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:12:32Z
Confirm-Evidence: piolium/findings/p10-008-stripe-customer-created-email-autolink/evidence/confirmed-20260823T091226Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: customers row of victim email updated via signed customer.created webhook to carry attacker stripe_customer_id (cus_attacker_p10_008_1787476346); subsequent invoice.paid for that attacker customer inserted into victim's invoices (customer_id=victim-local-row-008)
