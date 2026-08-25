import '../src/cloudflare-test.d.ts';

import * as Schema from 'effect/Schema';
import { Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { handleStripeWebhook } from '../src/handlers/billing';
import type { StripeFetch } from '../src/stripe-reconciliation';
import inboxMigration from '../migrations/011_stripe_event_inbox.sql?raw';
import claimTokenMigration from '../migrations/018_stripe_event_claim_tokens.sql?raw';

const WEBHOOK_SECRET = 'whsec_test_inbox';
const InboxRowSchema = Schema.Struct({
  status: Schema.Literal('received', 'processing', 'processed', 'failed'),
  attempt_count: Schema.Number,
  processed: Schema.Number,
});
const BillingProjectionRowSchema = Schema.Struct({
  customer_tier: Schema.String,
  license_tier: Schema.String,
  license_status: Schema.String,
  max_seats: Schema.Number,
  subscription_status: Schema.String,
});
const SubscriptionStatusRowSchema = Schema.Struct({
  status: Schema.String,
});
const InvoiceProjectionRowSchema = Schema.Struct({
  row_count: Schema.Number,
  amount_cents: Schema.Number,
  status: Schema.String,
});

interface CurrentSubscriptionFixture {
  readonly id: string;
  readonly customer: string;
  readonly status: string;
  readonly priceId: string;
}

function stripeSubscriptionFetch(fixture: CurrentSubscriptionFixture): StripeFetch {
  return async input => {
    const url = new URL(input);
    if (url.pathname !== `/v1/subscriptions/${fixture.id}`) {
      return new Response('Unexpected Stripe test request', { status: 404 });
    }
    return Response.json({
      id: fixture.id,
      customer: fixture.customer,
      status: fixture.status,
      current_period_end: Math.floor(Date.now() / 1000) + 86_400,
      items: { data: [{ price: { id: fixture.priceId }, quantity: 1 }] },
    });
  };
}

/** Subscription fixture whose first item is an unrecognized add-on price. */
const mixedItemSubscriptionFetch: StripeFetch = async input => {
  const url = new URL(input);
  if (url.pathname !== '/v1/subscriptions/sub_team') {
    return new Response('Unexpected Stripe test request', { status: 404 });
  }
  return Response.json({
    id: 'sub_team',
    customer: 'cus_team',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 86_400,
    items: {
      data: [
        { price: { id: 'price_addon_unknown' }, quantity: 1 },
        { price: { id: 'price_team_server' }, quantity: 1 },
      ],
    },
  });
};

async function stripeSignature(payload: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const signature = Array.from(new Uint8Array(bytes))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${signature}`;
}

async function webhookRequest(eventId: string): Promise<Request> {
  const payload = JSON.stringify({
    id: eventId,
    type: 'test.event',
    data: { object: { id: 'object_1' } },
  });
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': await stripeSignature(payload),
    },
    body: payload,
  });
}

async function subscriptionWebhookRequest(
  eventId: string,
  eventType: string,
  subscriptionId: string,
  customerId: string,
  status: string,
  priceId: string
): Promise<Request> {
  const payload = JSON.stringify({
    id: eventId,
    type: eventType,
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status,
        current_period_end: Math.floor(Date.now() / 1000) + 86_400,
        items: { data: [{ price: { id: priceId }, quantity: 1 }] },
      },
    },
  });
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': await stripeSignature(payload),
    },
    body: payload,
  });
}

async function invoicePaidWebhookRequest(
  eventId: string,
  customerId: string,
  amountPaid: number,
  status: string
): Promise<Request> {
  const payload = JSON.stringify({
    id: eventId,
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_idempotent',
        customer: customerId,
        subscription: 'sub_invoice_projection',
        amount_paid: amountPaid,
        currency: 'usd',
        status,
        hosted_invoice_url: 'https://example.com/invoice',
        invoice_pdf: 'https://example.com/invoice.pdf',
        period_start: 1_700_000_000,
        period_end: 1_700_086_400,
      },
    },
  });
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': await stripeSignature(payload),
    },
    body: payload,
  });
}

async function paymentFailedWebhookRequest(eventId: string, customerId: string): Promise<Request> {
  const payload = JSON.stringify({
    id: eventId,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_failed',
        customer: customerId,
        amount_due: 2900,
      },
    },
  });
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': await stripeSignature(payload),
    },
    body: payload,
  });
}

async function readInboxRow(eventId: string) {
  const row = await env.DB.prepare(
    `SELECT status, attempt_count, processed FROM stripe_events WHERE stripe_event_id = ?`
  )
    .bind(eventId)
    .first();
  const exit = await Effect.runPromiseExit(Schema.decodeUnknown(InboxRowSchema)(row));
  if (Exit.isFailure(exit)) {
    throw new Error('Stripe inbox row has an invalid shape');
  }
  return exit.value;
}

async function readBillingProjection(customerId: string) {
  const row = await env.DB.prepare(
    `SELECT c.tier AS customer_tier, l.tier AS license_tier,
            l.status AS license_status, l.max_seats,
            s.status AS subscription_status
     FROM customers c
     JOIN licenses l ON l.customer_id = c.id
     JOIN subscriptions s ON s.customer_id = c.id
     WHERE c.id = ?`
  )
    .bind(customerId)
    .first();
  return Schema.decodeUnknownSync(BillingProjectionRowSchema)(row);
}

describe('Stripe webhook inbox', () => {
  beforeEach(async () => {
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    env.STRIPE_SECRET_KEY = 'sk_test_reconciliation';
    env.STRIPE_PRO_PRICE_ID = 'price_pro_server';
    env.STRIPE_TEAM_PRICE_ID = 'price_team_server';
    try {
      await env.DB.prepare(`ALTER TABLE licenses ADD COLUMN max_seats INTEGER DEFAULT 1`).run();
    } catch {
      // The isolated test database may already include this column.
    }
    try {
      await env.DB.prepare(`ALTER TABLE audit_log ADD COLUMN metadata TEXT`).run();
    } catch {
      // The isolated test database may already include this column.
    }
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        stripe_subscription_id TEXT UNIQUE,
        status TEXT,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
    await env.DB.prepare(`DROP TABLE IF EXISTS stripe_events`).run();
    await env.DB.prepare(
      `CREATE TABLE stripe_events (
        id TEXT PRIMARY KEY,
        stripe_event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        customer_id TEXT,
        stripe_customer_id TEXT,
        event_data TEXT,
        processed INTEGER DEFAULT 0,
        processed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
    // Apply the claim-token column on top of the base inbox DDL.
    await env.DB.prepare(claimTokenMigration.trim()).run();
    const statements = inboxMigration
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
  });

  afterEach(async () => {
    await env.DB.prepare(`DELETE FROM invoices WHERE customer_id = 'billing-customer'`).run();
    await env.DB.prepare(`DELETE FROM subscriptions`).run();
    await env.DB.prepare(`DELETE FROM licenses WHERE customer_id = 'billing-customer'`).run();
    await env.DB.prepare(`DELETE FROM customers WHERE id = 'billing-customer'`).run();
    await env.DB.prepare(`DROP TABLE IF EXISTS stripe_events`).run();
  });

  it('processes a Stripe event exactly once', async () => {
    const first = await handleStripeWebhook(await webhookRequest('evt_inbox_once'), env);
    const duplicate = await handleStripeWebhook(await webhookRequest('evt_inbox_once'), env);

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await readInboxRow('evt_inbox_once')).toEqual({
      status: 'processed',
      attempt_count: 1,
      processed: 1,
    });
  });

  it('stores one invoice projection when distinct deliveries repeat an invoice id', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES ('billing-customer', 'billing@example.com', 'free', 'cus_invoice')`
    ).run();

    const first = await handleStripeWebhook(
      await invoicePaidWebhookRequest('evt_invoice_first', 'cus_invoice', 2_900, 'paid'),
      env
    );
    const repeated = await handleStripeWebhook(
      await invoicePaidWebhookRequest('evt_invoice_repeated', 'cus_invoice', 3_900, 'paid'),
      env
    );
    const projection = Schema.decodeUnknownSync(InvoiceProjectionRowSchema)(
      await env.DB.prepare(
        `SELECT COUNT(*) AS row_count, MAX(amount_cents) AS amount_cents, MAX(status) AS status
         FROM invoices WHERE stripe_invoice_id = 'in_idempotent'`
      ).first()
    );

    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(projection).toEqual({ row_count: 1, amount_cents: 3_900, status: 'paid' });
  });

  it('processes customer.created with a null-email real-world payload', async () => {
    // Stripe fixture customers carry email: null, name: null, and an empty
    // metadata object; the event envelope must decode despite them.
    const payload = JSON.stringify({
      id: 'evt_customer_null_email',
      object: 'event',
      api_version: '2026-06-24.dahlia',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cus_fixture_null_email',
          object: 'customer',
          created: Math.floor(Date.now() / 1000),
          email: null,
          name: null,
          metadata: {},
        },
      },
      livemode: false,
      type: 'customer.created',
    });

    const response = await handleStripeWebhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': await stripeSignature(payload),
        },
        body: payload,
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(await readInboxRow('evt_customer_null_email')).toEqual({
      status: 'processed',
      attempt_count: 1,
      processed: 1,
    });
  });

  it('asks Stripe to retry an event already being processed', async () => {
    await env.DB.prepare(
      `INSERT INTO stripe_events (
        id, stripe_event_id, event_type, event_data, status, attempt_count,
        processing_started_at, processed
      ) VALUES (?, ?, 'test.event', '{}', 'processing', 1, CURRENT_TIMESTAMP, 0)`
    )
      .bind('inbox-processing', 'evt_inbox_processing')
      .run();

    const response = await handleStripeWebhook(await webhookRequest('evt_inbox_processing'), env);

    expect(response.status).toBe(409);
    expect((await readInboxRow('evt_inbox_processing')).attempt_count).toBe(1);
  });

  it('projects the current Team subscription instead of a stale event snapshot', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES ('billing-customer', 'billing@example.com', 'free', 'cus_team')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES ('billing-license', 'billing-customer', 'license-team', 'free', 'active', 1, 1)`
    ).run();

    const response = await handleStripeWebhook(
      await subscriptionWebhookRequest(
        'evt_team_projection',
        'customer.subscription.deleted',
        'sub_team',
        'cus_team',
        'past_due',
        'price_pro_server'
      ),
      env,
      stripeSubscriptionFetch({
        id: 'sub_team',
        customer: 'cus_team',
        status: 'trialing',
        priceId: 'price_team_server',
      })
    );

    expect(response.status).toBe(200);
    expect(await readBillingProjection('billing-customer')).toEqual({
      customer_tier: 'team',
      license_tier: 'team',
      license_status: 'active',
      max_seats: 10,
      subscription_status: 'trialing',
    });
  });

  it('projects the recognized price when an unrecognized item precedes it', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES ('billing-customer', 'billing@example.com', 'free', 'cus_team')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES ('billing-license', 'billing-customer', 'license-team', 'free', 'active', 1, 1)`
    ).run();

    // Mixed-item subscription: an unrecognized add-on price occupies items[0];
    // the recognized Team price must be the one projected into subscriptions.
    const response = await handleStripeWebhook(
      await subscriptionWebhookRequest(
        'evt_mixed_projection',
        'customer.subscription.updated',
        'sub_team',
        'cus_team',
        'active',
        'price_team_server'
      ),
      env,
      mixedItemSubscriptionFetch
    );

    expect(response.status).toBe(200);
    const storedPrice = await env.DB.prepare(
      'SELECT stripe_price_id FROM subscriptions WHERE stripe_subscription_id = ?'
    )
      .bind('sub_team')
      .first<{ stripe_price_id: string | null }>();
    expect(storedPrice?.stripe_price_id).toBe('price_team_server');
    expect(await readBillingProjection('billing-customer')).toEqual({
      customer_tier: 'team',
      license_tier: 'team',
      license_status: 'active',
      max_seats: 10,
      subscription_status: 'active',
    });
  });

  it('fails closed on an unknown active price and retries from current state', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES ('billing-customer', 'billing@example.com', 'team', 'cus_team')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES ('billing-license', 'billing-customer', 'license-team', 'team', 'active', 10, 10)`
    ).run();
    const request = await subscriptionWebhookRequest(
      'evt_retry_projection',
      'customer.subscription.updated',
      'sub_team',
      'cus_team',
      'active',
      'price_team_server'
    );

    const failed = await handleStripeWebhook(
      request.clone(),
      env,
      stripeSubscriptionFetch({
        id: 'sub_team',
        customer: 'cus_team',
        status: 'active',
        priceId: 'price_unknown',
      })
    );
    expect(failed.status).toBe(500);
    expect(await readInboxRow('evt_retry_projection')).toEqual({
      status: 'failed',
      attempt_count: 1,
      processed: 0,
    });

    const retried = await handleStripeWebhook(
      request.clone(),
      env,
      stripeSubscriptionFetch({
        id: 'sub_team',
        customer: 'cus_team',
        status: 'active',
        priceId: 'price_pro_server',
      })
    );
    expect(retried.status).toBe(200);
    expect(await readInboxRow('evt_retry_projection')).toEqual({
      status: 'processed',
      attempt_count: 2,
      processed: 1,
    });
    expect(await readBillingProjection('billing-customer')).toEqual({
      customer_tier: 'pro',
      license_tier: 'pro',
      license_status: 'active',
      max_seats: 3,
      subscription_status: 'active',
    });
  });

  it('does not let an invoice failure overwrite current subscription state', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES ('billing-customer', 'billing@example.com', 'team', 'cus_team')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES ('billing-license', 'billing-customer', 'license-team', 'team', 'active', 10, 10)`
    ).run();
    await env.DB.prepare(
      `INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end)
       VALUES ('billing-subscription', 'billing-customer', 'sub_team', 'active', CURRENT_TIMESTAMP)`
    ).run();

    const response = await handleStripeWebhook(
      await paymentFailedWebhookRequest('evt_payment_failed_signal', 'cus_team'),
      env
    );
    const subscription = Schema.decodeUnknownSync(SubscriptionStatusRowSchema)(
      await env.DB.prepare(
        `SELECT status FROM subscriptions WHERE id = 'billing-subscription'`
      ).first()
    );

    expect(response.status).toBe(200);
    expect(subscription.status).toBe('active');
  });

  it('revokes access from the current canceled subscription state', async () => {
    await env.DB.prepare(
      `INSERT INTO customers (id, email, tier, stripe_customer_id)
       VALUES ('billing-customer', 'billing@example.com', 'team', 'cus_team')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO licenses (id, customer_id, license_key, tier, status, max_machines, max_seats)
       VALUES ('billing-license', 'billing-customer', 'license-team', 'team', 'active', 10, 10)`
    ).run();

    const response = await handleStripeWebhook(
      await subscriptionWebhookRequest(
        'evt_cancel_projection',
        'customer.subscription.updated',
        'sub_team',
        'cus_team',
        'active',
        'price_team_server'
      ),
      env,
      stripeSubscriptionFetch({
        id: 'sub_team',
        customer: 'cus_team',
        status: 'canceled',
        priceId: 'price_team_server',
      })
    );

    expect(response.status).toBe(200);
    expect(await readBillingProjection('billing-customer')).toEqual({
      customer_tier: 'free',
      license_tier: 'free',
      license_status: 'cancelled',
      max_seats: 10,
      subscription_status: 'canceled',
    });
  });
});
