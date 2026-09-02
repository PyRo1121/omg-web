# Billing fail-closed behavior

## Sub-features

- Pro and Team Checkout entry
- Recoverable same-origin failure
- Checkout-result status projection
- Billing Portal authorization boundary

## How to get to it (user POV)

Open `/` and choose Pro or Team. An unauthenticated or unavailable integration must keep the user on the OMG origin and show a bounded recovery message. Account Billing Portal access is available only to an authenticated account linked to a Stripe customer.

## Driving it with Playwright

Safe local proof:

```bash
npm run test:e2e -- e2e/billing-unconfigured.spec.ts
npm run test:e2e -- e2e/anonymous.spec.ts --grep 'bounded checkout verification state'
```

The Checkout button must become enabled again, the page must remain same-origin, and no `checkout.stripe.com` navigation may occur. The accepted message is “Sign in before starting checkout” or “Checkout is temporarily unavailable.”

## Verified live gate (2026-09-01)

- Authenticated Pro Checkout reached `omg-saas` with status `200`, returned an allowlisted `https://checkout.stripe.com` URL, and headed Helium completed the external redirect without payment.
- The single open unpaid live characterization session was expired through the Stripe CLI after a pre-check that required exactly one open unpaid session with complete pagination. Live Stripe then reported zero open sessions.
- Sanitized evidence: `~/.cache/build-targets/omg-web-tech-debt/billing/` (`20260901T223200Z-checkout`, `20260901T234646Z-expire`). Checkout URLs, session IDs, and customer identifiers stay out of evidence and transcripts.

## Gotchas

- Production uses Stripe live mode.
- Browser automation must not create customers, subscriptions, organizations, or Checkout Sessions. User-controlled authenticated Checkout creation is a controlled release check performed by the signed-in human; any session it creates must be expired and verified absent before the gate closes.
- Billing Portal fails closed with “No billing account is linked to this account.” when the signed-in account has no linked Stripe customer; do not weaken that classification.
- Anonymous Worker Checkout and Billing Portal requests should remain `401`.
