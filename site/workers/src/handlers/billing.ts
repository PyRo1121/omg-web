import { reportError } from '../observability';
import {
  type Env,
  jsonResponse,
  errorResponse,
  validateSession,
  getAuthToken,
  logAudit,
} from '../api';
import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { decodeJsonBody } from '../body';
import { EmailAddress } from '../../../shared/site-session';
import { forbiddenUnlessAdminSession } from '../admin-auth';
import { decodeThrownMessage } from '../contracts/http-bodies';
import {
  StripeCustomerIdRowSchema,
  StripeEventStateRowSchema,
  BillingCustomerRowSchema,
  customerIsAdmin,
  IdRowSchema,
  isInvalidExtraRow,
  optionalRowValue,
  readOptionalExtraRow,
} from '../contracts/d1-extras';
import {
  CheckoutRequestSchema,
  resolveBillingPrice,
  type BillingCatalog,
} from '../contracts/billing-offer';
import {
  decodeStripeJson,
  decodeStripeWebhookText,
  StripeBalanceSchema,
  StripeCheckoutSessionSchema,
  StripeCustomerListSchema,
  StripeInvoiceListSchema,
  StripeMetricsListSchema,
  StripePortalSessionSchema,
  StripeSubscriptionListSchema,
  type StripeWebhookEvent,
} from '../contracts/stripe';
import {
  applyStripeSubscriptionProjection,
  reconcileStripeSubscriptionSignal,
  type StripeFetch,
} from '../stripe-reconciliation';

const PortalBodySchema = Schema.Struct({
  email: Schema.optional(EmailAddress),
});

/** Fetch a Stripe API resource and decode its JSON payload; null when invalid. */
async function fetchStripeJson<S extends Schema.Schema.AnyNoContext>(
  apiKey: string,
  url: string | URL,
  schema: S,
  reason: string,
  init: RequestInit = {}
): Promise<Schema.Schema.Type<S> | null> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);
  const response = await fetch(url, { ...init, headers });
  const payload: unknown = await response.json();
  const decoded = await Effect.runPromiseExit(decodeStripeJson(schema, reason, payload));
  return Exit.isFailure(decoded) ? null : decoded.value;
}

function billingCatalog(env: Env): BillingCatalog {
  return {
    proPriceId: env.STRIPE_PRO_PRICE_ID,
    teamPriceId: env.STRIPE_TEAM_PRICE_ID,
  };
}

/** Authenticated session, or the error response that denies the caller. */
type SessionAuth = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

/** Authenticate the bearer token; Response denies the caller. */
async function authenticate(request: Request, env: Env): Promise<SessionAuth | Response> {
  const token = getAuthToken(request);
  if (!token) return errorResponse('Unauthorized', 401);

  const auth = await validateSession(env.DB, token);
  if (!auth) return errorResponse('Invalid session', 401);
  return auth;
}

/** Require an admin session plus a configured Stripe key; Response denies the caller. */
async function requireAdmin(request: Request, env: Env): Promise<SessionAuth | Response> {
  const authOrDenied = await authenticate(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;

  const adminCheck = await env.DB.prepare(`SELECT admin FROM customers WHERE id = ?`)
    .bind(authOrDenied.user.id)
    .first();

  if (!(await customerIsAdmin(adminCheck))) {
    return errorResponse('Unauthorized', 403);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return errorResponse('Billing is not configured', 503);
  }
  return authOrDenied;
}

/** Resolve an internal customer id from a Stripe customer id. */
async function resolveStripeCustomerId(
  db: D1Database,
  stripeCustomerId: string | null | undefined
): Promise<
  | { readonly ok: true; readonly customerId: string }
  | { readonly ok: false; readonly reason: 'invalid-row' | 'unlinked' }
> {
  const customerRow = await db
    .prepare('SELECT id FROM customers WHERE stripe_customer_id = ?')
    .bind(stripeCustomerId)
    .first();
  const customerLookup = await readOptionalExtraRow(
    IdRowSchema,
    'Billing customer id row has an invalid shape',
    customerRow
  );
  if (customerLookup._tag === 'invalid') {
    return { ok: false, reason: 'invalid-row' };
  }
  const customer = optionalRowValue(customerLookup);
  if (customer === undefined) {
    return { ok: false, reason: 'unlinked' };
  }
  return { ok: true, customerId: customer.id };
}

/** Page a Stripe list and sync each item with uniform counting and error reporting. */
async function syncStripeList<
  S extends Schema.Schema.AnyNoContext & {
    readonly Type: {
      readonly data: ReadonlyArray<{ readonly id: string }>;
      readonly has_more: boolean;
    };
  },
>(
  apiKey: string,
  path: string,
  extraParams: ReadonlyArray<readonly [string, string]>,
  label: string,
  schema: S,
  errors: string[],
  itemLabel: (item: Schema.Schema.Type<S>['data'][number]) => string,
  syncItem: (item: Schema.Schema.Type<S>['data'][number]) => Promise<boolean>,
  recordSynced: () => void
): Promise<void> {
  let startingAfter: string | undefined;
  for (;;) {
    const url = URL.parse(`https://api.stripe.com/v1/${path}`);
    if (url === null) {
      errors.push(`Stripe ${label} list URL is invalid`);
      return;
    }
    url.searchParams.set('limit', '100');
    for (const [key, value] of extraParams) url.searchParams.set(key, value);
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const page = await fetchStripeJson(
      apiKey,
      url,
      schema,
      `Stripe ${label} list has an invalid shape`
    );
    if (!page) {
      errors.push(`Stripe ${label} list has an invalid shape`);
      return;
    }

    for (const item of page.data) {
      try {
        if (await syncItem(item)) recordSynced();
      } catch (error: unknown) {
        errors.push(`${itemLabel(item)}: ${decodeThrownMessage(error) || 'unknown error'}`);
      }
    }

    if (!page.has_more) return;
    const cursor = page.data.at(-1)?.id;
    if (cursor === undefined) {
      errors.push(`Stripe ${label} pagination cursor is missing`);
      return;
    }
    startingAfter = cursor;
  }
}

async function claimStripeEvent(
  db: D1Database,
  event: StripeWebhookEvent,
  eventData: string
): Promise<'claimed' | 'processed' | 'busy' | 'invalid'> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO stripe_events (
        id, stripe_event_id, event_type, event_data, processed, status, attempt_count
      ) VALUES (?, ?, ?, ?, 0, 'received', 0)`
    )
    .bind(crypto.randomUUID(), event.id, event.type, eventData)
    .run();

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
  if (claim.meta.changes > 0) {
    return 'claimed';
  }

  const stateRow = await db
    .prepare(`SELECT status, processed FROM stripe_events WHERE stripe_event_id = ?`)
    .bind(event.id)
    .first();
  const stateLookup = await readOptionalExtraRow(
    StripeEventStateRowSchema,
    'Stripe event inbox row has an invalid shape',
    stateRow
  );
  if (stateLookup._tag !== 'present') {
    return 'invalid';
  }
  return stateLookup.value.processed === 1 || stateLookup.value.status === 'processed'
    ? 'processed'
    : 'busy';
}

async function markStripeEventProcessed(db: D1Database, eventId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE stripe_events
       SET status = 'processed', processed = 1, processed_at = CURRENT_TIMESTAMP,
           processing_started_at = NULL, last_error = NULL
       WHERE stripe_event_id = ?`
    )
    .bind(eventId)
    .run();
}

async function failedStripeEventResponse(
  db: D1Database,
  eventId: string,
  detail: string
): Promise<Response> {
  await db
    .prepare(
      `UPDATE stripe_events
       SET status = 'failed', processed = 0, processing_started_at = NULL, last_error = ?
       WHERE stripe_event_id = ?`
    )
    .bind(detail.slice(0, 1000), eventId)
    .run();
  return new Response('Stripe event reconciliation failed', { status: 500 });
}

/**
 * Verify Stripe webhook signature using HMAC-SHA256
 * This is CRITICAL for security - prevents webhook spoofing
 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();

    // Parse the Stripe signature header (format: t=timestamp,v1=signature)
    const parts = new Map<string, string>();
    for (const part of signature.split(',')) {
      const [key, value] = part.split('=');
      if (key && value) parts.set(key, value);
    }

    const timestamp = parts.get('t');
    const expectedSig = parts.get('v1');

    if (!timestamp || !expectedSig) {
      reportError('Stripe signature missing timestamp or v1 signature');
      return false;
    }

    // Check timestamp to prevent replay attacks (5 minute tolerance)
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNum) > 300) {
      reportError('Stripe webhook timestamp too old or in future');
      return false;
    }

    // Compute expected signature: HMAC-SHA256(timestamp.payload)
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));

    // Convert to hex string
    const computedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Timing-safe comparison to prevent timing attacks
    if (computedSig.length !== expectedSig.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < computedSig.length; i++) {
      result |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }

    return result === 0;
  } catch (error: unknown) {
    reportError('Stripe signature verification error:', error);
    return false;
  }
}

export async function handleCreateCheckout(request: Request, env: Env): Promise<Response> {
  const authOrDenied = await authenticate(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;
  const auth = authOrDenied;

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, CheckoutRequestSchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid billing offer', 400);
  }
  const { offer } = decoded.value;
  const priceExit = await Effect.runPromiseExit(resolveBillingPrice(offer, billingCatalog(env)));
  if (Exit.isFailure(priceExit)) {
    return errorResponse('Billing offer unavailable', 503);
  }
  const priceId = priceExit.value;
  const email = auth.user.email;
  if (!env.STRIPE_SECRET_KEY) {
    return errorResponse('Billing is not configured', 503);
  }

  const session = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    'https://api.stripe.com/v1/checkout/sessions',
    StripeCheckoutSessionSchema,
    'Stripe checkout session has an invalid shape',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        mode: 'subscription',
        customer_email: email,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        success_url: 'https://omg.latham.cloud/dashboard?success=true',
        cancel_url: 'https://omg.latham.cloud/#pricing',
      }),
    }
  );
  if (!session) {
    return errorResponse('Failed to create checkout session', 500);
  }

  if (session.error) {
    return errorResponse(session.error.message);
  }

  if (!session.url) {
    return errorResponse('Failed to create checkout session', 500);
  }

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'billing.checkout_created', 'checkout', session.id, request, {
      offer,
    })
  );

  return jsonResponse({ sessionId: session.id, url: session.url });
}

export async function handleBillingPortal(request: Request, env: Env): Promise<Response> {
  const authOrDenied = await authenticate(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;
  const auth = authOrDenied;

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, PortalBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const requestedEmail = decoded.value.email;
  let email = auth.user.email;
  if (requestedEmail !== undefined && requestedEmail !== auth.user.email) {
    const denied = await forbiddenUnlessAdminSession(request, env);
    if (denied === null) {
      email = requestedEmail;
    }
  }

  const customer = await env.DB.prepare(`SELECT stripe_customer_id FROM customers WHERE email = ?`)
    .bind(email)
    .first();

  const stripeCustomerLookup = await readOptionalExtraRow(
    StripeCustomerIdRowSchema,
    'Billing customer row has an invalid shape',
    customer
  );
  if (isInvalidExtraRow(stripeCustomerLookup)) {
    return errorResponse('Failed to load billing account', 500);
  }
  if (
    stripeCustomerLookup._tag === 'missing' ||
    stripeCustomerLookup.value.stripe_customer_id === null
  ) {
    return errorResponse('No billing account found for this email', 404);
  }
  const stripeCustomerId = stripeCustomerLookup.value.stripe_customer_id;
  if (!env.STRIPE_SECRET_KEY) {
    return errorResponse('Billing is not configured', 503);
  }

  const session = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    'https://api.stripe.com/v1/billing_portal/sessions',
    StripePortalSessionSchema,
    'Stripe portal session has an invalid shape',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer: stripeCustomerId,
        return_url: 'https://omg.latham.cloud/dashboard?portal=closed',
      }),
    }
  );
  if (!session) {
    return errorResponse('Failed to create portal session');
  }

  if (session.error || !session.url) {
    return errorResponse(session.error?.message || 'Failed to create portal session');
  }

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'billing.portal_opened', 'portal', null, request)
  );

  return jsonResponse({ success: true, url: session.url });
}

export async function handleStripeWebhook(
  request: Request,
  env: Env,
  stripeFetch: StripeFetch = fetch
): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Missing signature or secret', { status: 400 });
  }

  const body = await request.text();

  // Verify Stripe signature
  const isValid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const decodedEvent = await Effect.runPromiseExit(decodeStripeWebhookText(body));
  if (Exit.isFailure(decodedEvent)) {
    return new Response('Invalid JSON', { status: 400 });
  }
  const event = decodedEvent.value;
  const claim = await claimStripeEvent(env.DB, event, body);
  if (claim === 'processed') {
    return new Response('OK');
  }
  if (claim === 'busy') {
    return new Response('Event processing in progress', {
      status: 409,
      headers: { 'Retry-After': '5' },
    });
  }
  if (claim === 'invalid') {
    return new Response('Failed to load webhook inbox', { status: 500 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscriptionId = event.data.object.id;
      if (subscriptionId === undefined || subscriptionId.length === 0) {
        return failedStripeEventResponse(env.DB, event.id, 'Subscription event has no object id');
      }

      try {
        await reconcileStripeSubscriptionSignal(
          env.DB,
          subscriptionId,
          env.STRIPE_SECRET_KEY,
          billingCatalog(env),
          stripeFetch
        );
      } catch (error: unknown) {
        return failedStripeEventResponse(
          env.DB,
          event.id,
          decodeThrownMessage(error) || 'Unknown subscription reconciliation failure'
        );
      }
      break;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const resolved = await resolveStripeCustomerId(env.DB, invoice.customer);
      if (!resolved.ok) {
        if (resolved.reason === 'invalid-row') {
          return new Response('Failed to load customer', { status: 500 });
        }
        break;
      }

      if (event.type === 'invoice.paid') {
        // Idempotent by stripe_invoice_id: repeated webhook deliveries update
        // the same row instead of inserting duplicates under fresh UUIDs.
        await env.DB.prepare(
          `INSERT INTO invoices (id, customer_id, stripe_invoice_id, amount_cents, currency, status, invoice_url, invoice_pdf, period_start, period_end, created_at)
           VALUES ((SELECT id FROM invoices WHERE stripe_invoice_id = ?), ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             amount_cents = excluded.amount_cents,
             currency = excluded.currency,
             status = excluded.status`
        )
          .bind(
            invoice.id,
            crypto.randomUUID(),
            resolved.customerId,
            invoice.id,
            invoice.amount_paid ?? null,
            invoice.currency ?? null,
            invoice.status ?? null,
            invoice.hosted_invoice_url ?? null,
            invoice.invoice_pdf ?? null,
            invoice.period_start ?? null,
            invoice.period_end ?? null
          )
          .run();
      } else {
        // Preserve the historical payment signal without mutating current subscription state.
        await env.DB.prepare(
          `INSERT INTO audit_log (id, customer_id, action, metadata, created_at)
           VALUES (?, ?, 'billing.payment_failed', ?, CURRENT_TIMESTAMP)`
        )
          .bind(
            crypto.randomUUID(),
            resolved.customerId,
            JSON.stringify({ invoice_id: invoice.id, amount: invoice.amount_due })
          )
          .run();
      }
      break;
    }

    case 'customer.created': {
      const stripeCustomer = event.data.object;

      // Customers without an email (possible at fixture/checkout start) cannot
      // be keyed; the row is created by later events that carry one.
      if (!stripeCustomer.email) {
        break;
      }

      // Check if customer already exists
      const existingRow = await env.DB.prepare(
        'SELECT id, stripe_customer_id FROM customers WHERE stripe_customer_id = ? OR email = ?'
      )
        .bind(stripeCustomer.id, stripeCustomer.email)
        .first();
      const existingLookup = await readOptionalExtraRow(
        BillingCustomerRowSchema,
        'Billing customer link row has an invalid shape',
        existingRow
      );
      if (existingLookup._tag === 'invalid') {
        return new Response('Failed to load customer', { status: 500 });
      }
      // Never auto-link an existing bare-email match; invoice.paid proves payment.
      if (optionalRowValue(existingLookup) !== undefined) break;

      await env.DB.prepare(
        `INSERT INTO customers (id, stripe_customer_id, email, company, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
        .bind(
          crypto.randomUUID(),
          stripeCustomer.id,
          stripeCustomer.email,
          stripeCustomer.metadata?.company || null
        )
        .run();
      break;
    }
    default:
      // Unknown event types are durable no-ops so Stripe does not retry them indefinitely.
      break;
  }

  await markStripeEventProcessed(env.DB, event.id);
  return new Response('OK');
}

/**
 * Admin: Sync all Stripe data (customers, subscriptions, invoices)
 * This is useful for initial setup or data recovery
 */
export async function handleAdminStripeSync(request: Request, env: Env): Promise<Response> {
  const authOrDenied = await requireAdmin(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;
  const auth = authOrDenied;

  const errors: string[] = [];
  const results = {
    customers_synced: 0,
    subscriptions_synced: 0,
    invoices_synced: 0,
    errors,
  };

  try {
    await syncStripeList(
      env.STRIPE_SECRET_KEY,
      'customers',
      [],
      'customer',
      StripeCustomerListSchema,
      errors,
      customer => `Customer ${customer.email}`,
      async customer => {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO customers (id, stripe_customer_id, email, company, created_at)
           VALUES (COALESCE((SELECT id FROM customers WHERE stripe_customer_id = ? OR email = ?), ?), ?, ?, ?, CURRENT_TIMESTAMP)`
        )
          .bind(
            customer.id,
            customer.email,
            crypto.randomUUID(),
            customer.id,
            customer.email,
            customer.metadata?.company
          )
          .run();
        return true;
      },
      () => results.customers_synced++
    );

    await syncStripeList(
      env.STRIPE_SECRET_KEY,
      'subscriptions',
      [['status', 'all']],
      'subscription',
      StripeSubscriptionListSchema,
      errors,
      sub => `Subscription ${sub.id}`,
      async sub => {
        const resolved = await resolveStripeCustomerId(env.DB, sub.customer);
        if (!resolved.ok) {
          if (resolved.reason === 'invalid-row') {
            errors.push(`Subscription ${sub.id}: customer row has an invalid shape`);
          }
          return false;
        }
        await applyStripeSubscriptionProjection(
          env.DB,
          resolved.customerId,
          sub,
          billingCatalog(env)
        );
        return true;
      },
      () => results.subscriptions_synced++
    );

    const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
    await syncStripeList(
      env.STRIPE_SECRET_KEY,
      'invoices',
      [['created[gte]', twelveMonthsAgo.toString()]],
      'invoice',
      StripeInvoiceListSchema,
      errors,
      invoice => `Invoice ${invoice.id}`,
      async invoice => {
        if (invoice.status !== 'paid') return false;

        const resolved = await resolveStripeCustomerId(env.DB, invoice.customer);
        if (!resolved.ok) {
          if (resolved.reason === 'invalid-row') {
            errors.push(`Invoice ${invoice.id}: customer row has an invalid shape`);
          }
          return false;
        }
        await env.DB.prepare(
          `INSERT OR REPLACE INTO invoices (id, customer_id, stripe_invoice_id, amount_cents, currency, status, invoice_url, invoice_pdf, period_start, period_end, created_at)
           VALUES (COALESCE((SELECT id FROM invoices WHERE stripe_invoice_id = ?), ?), ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), datetime(?, 'unixepoch'))`
        )
          .bind(
            invoice.id,
            crypto.randomUUID(),
            resolved.customerId,
            invoice.id,
            invoice.amount_paid ?? null,
            invoice.currency ?? null,
            invoice.status ?? null,
            invoice.hosted_invoice_url ?? null,
            invoice.invoice_pdf ?? null,
            invoice.period_start ?? null,
            invoice.period_end ?? null,
            invoice.created ?? null
          )
          .run();
        return true;
      },
      () => results.invoices_synced++
    );
  } catch (error: unknown) {
    results.errors.push(`Sync error: ${decodeThrownMessage(error) || 'unknown error'}`);
  }

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'admin.stripe_sync', 'stripe', null, request, results)
  );

  return jsonResponse(results);
}

/**
 * Admin: Get real-time Stripe metrics (MRR, subscriber counts, etc.)
 */
export async function handleAdminStripeMetrics(request: Request, env: Env): Promise<Response> {
  const authOrDenied = await requireAdmin(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;

  // Fetch active subscriptions from Stripe for accurate MRR
  const subsData = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    'https://api.stripe.com/v1/subscriptions?status=active&limit=100',
    StripeMetricsListSchema,
    'Stripe metrics subscription list has an invalid shape'
  );
  if (!subsData) {
    return errorResponse('Failed to load Stripe metrics', 500);
  }

  let mrr = 0;
  const tierCounts = { pro: 0, team: 0, enterprise: 0 } satisfies Record<string, number>;

  for (const sub of subsData.data) {
    for (const item of sub.items.data) {
      const amount = item.price.unit_amount || 0;
      const interval = item.price.recurring?.interval;
      const intervalCount = item.price.recurring?.interval_count || 1;

      // Convert to monthly
      let monthlyAmount = amount;
      if (interval === 'year') {
        monthlyAmount = amount / (12 * intervalCount);
      } else if (interval === 'month') {
        monthlyAmount = amount / intervalCount;
      }

      mrr += monthlyAmount;

      // Categorize by tier based on price
      if (monthlyAmount >= 50000) {
        tierCounts.enterprise++;
      } else if (monthlyAmount >= 20000) {
        tierCounts.team++;
      } else {
        tierCounts.pro++;
      }
    }
  }

  // Fetch recent balance (available + pending)
  const balance = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    'https://api.stripe.com/v1/balance',
    StripeBalanceSchema,
    'Stripe balance has an invalid shape'
  );
  if (!balance) {
    return errorResponse('Failed to load Stripe balance', 500);
  }

  const availableBalance = balance.available.reduce((sum, funds) => sum + funds.amount, 0);
  const pendingBalance = balance.pending.reduce((sum, funds) => sum + funds.amount, 0);

  return jsonResponse({
    mrr: Math.round(mrr),
    arr: Math.round(mrr * 12),
    active_subscriptions: subsData.data.length,
    tier_breakdown: tierCounts,
    balance: {
      available: availableBalance,
      pending: pendingBalance,
      currency: 'usd',
    },
  });
}
