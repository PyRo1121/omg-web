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

## Gotchas

- Production uses Stripe live mode.
- Browser automation must not create customers, subscriptions, organizations, or Checkout Sessions.
- Authenticated Checkout remains a controlled release check; do not weaken the boundary or fabricate provider success.
- Anonymous Worker Checkout and Billing Portal requests should remain `401`.
