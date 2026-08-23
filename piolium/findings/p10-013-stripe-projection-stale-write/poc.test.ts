/**
 * PoC for p10-013-stripe-projection-stale-write (MEDIUM).
 *
 * Runs the REAL handler (`handleStripeWebhook` from src/handlers/billing.ts)
 * inside workerd against the REAL D1 binding (cloudflare:test isolated storage),
 * with properly HMAC-signed webhook requests.
 *
 * Exploit: two DIFFERENT subscription events for the same customer are delivered
 * concurrently. Each claims its own stripe_events inbox row (the claim only
 * serializes retries of the SAME event id), so both run
 * reconcileStripeSubscriptionSignal concurrently:
 *
 *   worker A (stale signal) : GET /v1/subscriptions/sub -> [SUSPENDED holding "active pro"]
 *   worker B (cancel signal): GET -> "canceled" -> projects free/cancelled -> commits
 *   worker A                : resumes, projects its STALE "active pro" snapshot LAST
 *
 * Result: customers.tier='pro' + licenses.status='active' while Stripe's current
 * state is 'canceled'. validate-license then mints a Pro JWT for the cancelled
 * customer — silent entitlement divergence, no error, no log.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { handleStripeWebhook } from '../../../site/workers/src/handlers/billing';
import { handleValidateLicense } from '../../../site/workers/src/handlers/license';
import type { StripeFetch } from '../../../site/workers/src/stripe-reconciliation';

const WEBHOOK_SECRET = 'whsec_poc_p10_013';
const CUSTOMER_ID = 'poc-customer';
const STRIPE_CUSTOMER = 'cus_poc_victim';
const SUBSCRIPTION_ID = 'sub_poc_victim';
const PRO_PRICE = 'price_pro_server';
const LICENSE_KEY = 'poc-license-key-0001';
const PERIOD_END = Math.floor(Date.now() / 1000) + 86_400 * 30;

function subSnapshot(status: string) {
  return {
    id: SUBSCRIPTION_ID,
    object: 'subscription',
    customer: STRIPE_CUSTOMER,
    status,
    current_period_end: PERIOD_END,
    items: { data: [{ price: { id: PRO_PRICE }, quantity: 1 }] },
  };
}

async function stripeSignature(payload: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const sig = Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${sig}`;
}

async function subWebhook(eventId: string, signalStatus: string): Promise<Request> {
  const payload = JSON.stringify({
    id: eventId,
    type: 'customer.subscription.updated',
    data: { object: subSnapshot(signalStatus) },
  });
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': await stripeSignature(payload) },
    body: payload,
  });
}

async function projection() {
  return env.DB.prepare(
    `SELECT c.tier AS customer_tier, l.tier AS license_tier, l.status AS license_status,
            s.status AS subscription_status
     FROM customers c
     JOIN licenses l ON l.customer_id = c.id
     LEFT JOIN subscriptions s ON s.customer_id = c.id
     WHERE c.stripe_customer_id = ?`
  )
    .bind(STRIPE_CUSTOMER)
    .first<Record<string, string>>();
}

describe('p10-013: stale Stripe projection commits last over newer cancel', () => {
  beforeEach(async () => {
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    env.STRIPE_SECRET_KEY = 'sk_test_poc_p10_013';
    env.STRIPE_PRO_PRICE_ID = PRO_PRICE;
    env.STRIPE_TEAM_PRICE_ID = 'price_team_server';
    env.JWT_SECRET = 'poc-jwt-secret';

    await env.DB.prepare(`DELETE FROM stripe_events`).run();
    await env.DB.prepare(`DELETE FROM machines WHERE license_id = 'poc-license'`).run();
    await env.DB.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).bind(CUSTOMER_ID).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = 'poc-license'`).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(CUSTOMER_ID).run();

    // Paying customer currently holding an active Pro license (baseline state).
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES (?, 'victim@example.com', 'pro', ?)`
    )
      .bind(CUSTOMER_ID, STRIPE_CUSTOMER)
      .run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES ('poc-license', ?, ?, 'pro', 'active', 3, 3)`
    )
      .bind(CUSTOMER_ID, LICENSE_KEY)
      .run();
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM stripe_events`).run();
    await env.DB.prepare(`DELETE FROM machines WHERE license_id = 'poc-license'`).run();
    await env.DB.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).bind(CUSTOMER_ID).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE id = 'poc-license'`).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(CUSTOMER_ID).run();
  });

  it('cancelled subscription keeps a Pro entitlement after the stale snapshot commits last', async () => {
    // Gate that parks worker A's Stripe GET after it has read the OLD snapshot.
    let releaseStale!: (response: Response) => void;
    const staleGate = new Promise<Response>(resolve => (releaseStale = resolve));
    let signalStaleFetched!: () => void;
    const staleFetched = new Promise<void>(resolve => (signalStaleFetched = resolve));

    let subscriptionGets = 0;
    const stripeMock: StripeFetch = async input => {
      const url = new URL(input);
      if (url.pathname === `/v1/subscriptions/${SUBSCRIPTION_ID}`) {
        subscriptionGets += 1;
        if (subscriptionGets === 1) {
          signalStaleFetched(); // worker A has fetched; suspend before projecting
          return await staleGate;
        }
        // Worker B (and any later read) sees Stripe's CURRENT truth: canceled.
        return Response.json(subSnapshot('canceled'));
      }
      return new Response('unexpected Stripe request', { status: 404 });
    };

    // Two distinct events -> two distinct inbox rows -> both claimable concurrently.
    const requestA = await subWebhook('evt_poc_stale_active', 'active'); // older signal (e.g. delayed retry)
    const requestB = await subWebhook('evt_poc_fresh_cancel', 'canceled'); // newer cancel

    const workerA = handleStripeWebhook(requestA, env, stripeMock);
    await staleFetched; // A is suspended mid fetch-then-project

    // Worker B runs to completion first: correctly projects the cancellation.
    const responseB = await handleStripeWebhook(requestB, env, stripeMock);
    expect(responseB.status).toBe(200);
    const afterB = await projection();
    console.log('[poc] after fresh cancel commits:', JSON.stringify(afterB));
    expect(afterB?.customer_tier).toBe('free');
    expect(afterB?.license_status).toBe('cancelled');

    // Now release worker A: its OLDER fetched snapshot ("active pro") commits LAST.
    releaseStale(Response.json(subSnapshot('active')));
    const responseA = await workerA;
    expect(responseA.status).toBe(200);

    const finalState = await projection();
    console.log('[poc] final DB state:', JSON.stringify(finalState));

    // Stripe's current state says 'canceled'; every projected table now asserts
    // the STALE snapshot instead — even subscriptions.status was rolled back.
    expect(finalState?.subscription_status).toBe('active');
    expect(finalState?.customer_tier).toBe('pro');
    expect(finalState?.license_tier).toBe('pro');
    expect(finalState?.license_status).toBe('active');

    // Security impact: validate-license honors the stale row and mints a Pro JWT
    // for a customer whose subscription is cancelled at Stripe.
    const licenseResponse = await handleValidateLicense(
      new Request('http://localhost/api/validate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: LICENSE_KEY, machine_id: 'poc-machine' }),
      }),
      env
    );
    const licensePayload = (await licenseResponse.json()) as {
      valid: boolean;
      tier?: string;
      token?: string;
    };
    console.log(
      '[poc] validate-license response:',
      JSON.stringify({ ...licensePayload, token: [REDACTED:secret], 24) + '...' })
    );
    expect(licensePayload.valid).toBe(true);
    expect(licensePayload.tier).toBe('pro');
    expect(typeof licensePayload.token).toBe('string');
  });
});
