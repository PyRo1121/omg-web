import '../src/cloudflare-test.d.ts';

import { Schema } from '@effect/schema';
import { Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { handleStripeWebhook } from '../src/handlers/billing';
import inboxMigration from '../migrations/011_stripe_event_inbox.sql?raw';

const WEBHOOK_SECRET = 'whsec_test_inbox';
const InboxRowSchema = Schema.Struct({
  status: Schema.Literal('received', 'processing', 'processed', 'failed'),
  attempt_count: Schema.Number,
  processed: Schema.Number,
});

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

describe('Stripe webhook inbox', () => {
  beforeEach(async () => {
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
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
    const statements = inboxMigration
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
  });

  afterEach(async () => {
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
});
