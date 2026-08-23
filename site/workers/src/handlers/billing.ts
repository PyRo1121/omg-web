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
  type IdRow,
  isInvalidExtraRow,
  optionalRowValue,
  readOptionalExtraRow,
  type OptionalExtraRow,
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

async function readStripeJson<S extends Schema.Schema.AnyNoContext>(
  response: Response,
  schema: S,
  reason: string
): Promise<Schema.Schema.Type<S> | null> {
  const payload: unknown = await response.json();
  const decoded = await Effect.runPromiseExit(decodeStripeJson(schema, reason, payload));
  if (Exit.isFailure(decoded)) {
    return null;
  }
  return decoded.value;
}

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
  return readStripeJson(response, schema, reason);
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

function lastStripeResourceId(resources: ReadonlyArray<{ readonly id: string }>): string | null {
  return resources.at(-1)?.id ?? null;
}

/**
 * Look up a `customers.id` by Stripe customer id without treating malformed
 * rows as missing.
 */
async function findCustomerIdByStripeCustomer(
  db: D1Database,
  stripeCustomerId: string | null | undefined
): Promise<OptionalExtraRow<IdRow>> {
  const customerRow = await db
    .prepare('SELECT id FROM customers WHERE stripe_customer_id = ?')
    .bind(stripeCustomerId)
    .first();
  return readOptionalExtraRow(
    IdRowSchema,
    'Billing customer id row has an invalid shape',
    customerRow
  );
}

/** Shape shared by every paginated Stripe list endpoint. */
type StripeListEnvelope = {
  readonly data: ReadonlyArray<{ readonly id: string }>;
  readonly has_more: boolean;
};

/**
 * Walk every page of a paginated Stripe list endpoint, invoking `onPage` once
 * per decoded page before advancing the cursor. Returns a failure message when
 * a page has an invalid shape or the pagination cursor is missing, else null.
 */
async function pageStripeList<
  S extends Schema.Schema.AnyNoContext & { readonly Type: StripeListEnvelope },
>(
  apiKey: string,
  path: string,
  extraParams: ReadonlyArray<readonly [string, string]>,
  label: string,
  schema: S,
  onPage: (page: Schema.Schema.Type<S>) => Promise<void>
): Promise<string | null> {
  let startingAfter: string | undefined;
  for (;;) {
    const url = URL.parse(`https://api.stripe.com/v1/${path}`);
    if (url === null) {
      return `Stripe ${label} list URL is invalid`;
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
    if (!page) return `Stripe ${label} list has an invalid shape`;

    await onPage(page);

    if (!page.has_more) return null;
    const cursor = lastStripeResourceId(page.data);
    if (cursor === null) return `Stripe ${label} pagination cursor is missing`;
    startingAfter = cursor;
  }
}

type StripeEventClaim = 'claimed' | 'processed' | 'busy' | 'invalid';

async function claimStripeEvent(
  db: D1Database,
  event: StripeWebhookEvent,
  eventData: string
): Promise<StripeEventClaim> {
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

async function markStripeEventFailed(
  db: D1Database,
  eventId: string,
  detail: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE stripe_events
       SET status = 'failed', processed = 0, processing_started_at = NULL, last_error = ?
       WHERE stripe_event_id = ?`
    )
    .bind(detail.slice(0, 1000), eventId)
    .run();
}

async function failedStripeEventResponse(
  db: D1Database,
  eventId: string,
  detail: string
): Promise<Response> {
  await markStripeEventFailed(db, eventId, detail);
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
  const priceExit = await Effect.runPromiseExit(
    resolveBillingPrice(offer, {
      proPriceId: env.STRIPE_PRO_PRICE_ID,
      teamPriceId: env.STRIPE_TEAM_PRICE_ID,
    })
  );
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

    case 'invoice.paid': {
      const invoice = event.data.object;

      const customerLookup = await findCustomerIdByStripeCustomer(env.DB, invoice.customer);
      if (customerLookup._tag === 'invalid') {
        return new Response('Failed to load customer', { status: 500 });
      }
      const customer = optionalRowValue(customerLookup);

      if (customer !== undefined) {
        // Store invoice in database for revenue tracking
        await env.DB.prepare(
          `INSERT OR REPLACE INTO invoices (id, customer_id, stripe_invoice_id, amount_cents, currency, status, invoice_url, invoice_pdf, period_start, period_end, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), CURRENT_TIMESTAMP)`
        )
          .bind(
            crypto.randomUUID(),
            customer.id,
            invoice.id,
            invoice.amount_paid,
            invoice.currency,
            invoice.status,
            invoice.hosted_invoice_url || null,
            invoice.invoice_pdf || null,
            invoice.period_start,
            invoice.period_end
          )
          .run();
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;

      const customerLookup = await findCustomerIdByStripeCustomer(env.DB, invoice.customer);
      if (customerLookup._tag === 'invalid') {
        return new Response('Failed to load customer', { status: 500 });
      }
      const customer = optionalRowValue(customerLookup);

      if (customer !== undefined) {
        // Preserve the historical payment signal without mutating current subscription state.
        await env.DB.prepare(
          `INSERT INTO audit_log (id, customer_id, action, metadata, created_at)
           VALUES (?, ?, 'billing.payment_failed', ?, CURRENT_TIMESTAMP)`
        )
          .bind(
            crypto.randomUUID(),
            customer.id,
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
      const existing = existingLookup._tag === 'present' ? existingLookup.value : undefined;

      if (existing === undefined) {
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
      } else if (!existing.stripe_customer_id) {
        // Do NOT auto-link by bare email match — an attacker who knows the
        // victim's signup email could create their own Stripe customer with
        // that email and hijack the billing relationship. Linking happens
        // exclusively via invoice.paid (proves actual payment).
        break;
      }
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
    // Sync customers
    const customersFailure = await pageStripeList(
      env.STRIPE_SECRET_KEY,
      'customers',
      [],
      'customer',
      StripeCustomerListSchema,
      async page => {
        for (const customer of page.data) {
          try {
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
            results.customers_synced++;
          } catch (error: unknown) {
            results.errors.push(
              `Customer ${customer.email}: ${decodeThrownMessage(error) || 'unknown error'}`
            );
          }
        }
      }
    );
    if (customersFailure !== null) results.errors.push(customersFailure);

    // Sync subscriptions
    const subscriptionsFailure = await pageStripeList(
      env.STRIPE_SECRET_KEY,
      'subscriptions',
      [['status', 'all']],
      'subscription',
      StripeSubscriptionListSchema,
      async page => {
        for (const sub of page.data) {
          try {
            const customerLookup = await findCustomerIdByStripeCustomer(env.DB, sub.customer);
            if (customerLookup._tag === 'invalid') {
              results.errors.push(`Subscription ${sub.id}: customer row has an invalid shape`);
              continue;
            }
            const customer = optionalRowValue(customerLookup);

            if (customer !== undefined) {
              await applyStripeSubscriptionProjection(
                env.DB,
                customer.id,
                sub,
                billingCatalog(env)
              );
              results.subscriptions_synced++;
            }
          } catch (error: unknown) {
            results.errors.push(
              `Subscription ${sub.id}: ${decodeThrownMessage(error) || 'unknown error'}`
            );
          }
        }
      }
    );
    if (subscriptionsFailure !== null) results.errors.push(subscriptionsFailure);

    // Sync invoices (last 12 months)
    const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
    const invoicesFailure = await pageStripeList(
      env.STRIPE_SECRET_KEY,
      'invoices',
      [['created[gte]', twelveMonthsAgo.toString()]],
      'invoice',
      StripeInvoiceListSchema,
      async page => {
        for (const invoice of page.data) {
          if (invoice.status !== 'paid') continue;

          try {
            const customerLookup = await findCustomerIdByStripeCustomer(env.DB, invoice.customer);
            if (customerLookup._tag === 'invalid') {
              results.errors.push(`Invoice ${invoice.id}: customer row has an invalid shape`);
              continue;
            }
            const customer = optionalRowValue(customerLookup);

            if (customer !== undefined) {
              await env.DB.prepare(
                `INSERT OR REPLACE INTO invoices (id, customer_id, stripe_invoice_id, amount_cents, currency, status, invoice_url, invoice_pdf, period_start, period_end, created_at)
                 VALUES (COALESCE((SELECT id FROM invoices WHERE stripe_invoice_id = ?), ?), ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), datetime(?, 'unixepoch'))`
              )
                .bind(
                  invoice.id,
                  crypto.randomUUID(),
                  customer.id,
                  invoice.id,
                  invoice.amount_paid,
                  invoice.currency,
                  invoice.status,
                  invoice.hosted_invoice_url,
                  invoice.invoice_pdf,
                  invoice.period_start,
                  invoice.period_end,
                  invoice.created
                )
                .run();
              results.invoices_synced++;
            }
          } catch (error: unknown) {
            results.errors.push(
              `Invoice ${invoice.id}: ${decodeThrownMessage(error) || 'unknown error'}`
            );
          }
        }
      }
    );
    if (invoicesFailure !== null) results.errors.push(invoicesFailure);
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
