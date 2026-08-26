import { reportError, reportInfo, reportWarning } from '../observability';
import { type Env, jsonResponse, errorResponse, enforceRateLimit, logAudit } from '../api';
import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';
import { decodeJsonBody } from '../body';
import { EmailAddress } from '../../../shared/site-session';
import {
  authenticateSession,
  forbiddenUnlessAdminSession,
  isAdminCustomer,
  type AuthedSession,
} from '../admin-auth';
import { decodeThrownMessage } from '../contracts/http-bodies';
import {
  StripeCustomerIdRowSchema,
  StripeEventStateRowSchema,
  BillingCustomerRowSchema,
  IdRowSchema,
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
  StripeCheckoutSessionSchema,
  StripeCheckoutStatusSchema,
  StripeCustomerListSchema,
  StripeInvoiceListSchema,
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

/** An active license provisioned for a paid checkout customer. */
const LicenseKeyTierRowSchema = Schema.Struct({
  license_key: Schema.String.pipe(Schema.minLength(1)),
  tier: Schema.String,
});

const MarketingPromotionRowSchema = Schema.Struct({
  stripe_promotion_code_id: Schema.String.pipe(Schema.pattern(/^promo_[A-Za-z0-9_]+$/)),
});

/** Checkout Session ids are high-entropy Stripe capabilities; bound the shape. */
const CheckoutSessionIdPattern = /^cs_[A-Za-z0-9]{10,200}$/;

/**
 * Fetch a Stripe API resource and decode its JSON payload.
 *
 * Network failures, non-JSON responses, and schema violations all resolve to
 * null so callers share one uniform "Stripe call failed" channel; every
 * failure cause is reported to observability before null is returned.
 */
async function fetchStripeJson<S extends Schema.Schema.AnyNoContext>(
  apiKey: string,
  url: string | URL,
  schema: S,
  reason: string,
  init: RequestInit = {},
  stripeFetch: typeof fetch = fetch
): Promise<Schema.Schema.Type<S> | null> {
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    const response = await stripeFetch(url, { ...init, headers });
    const payload: unknown = await response.json();
    const decoded = await Effect.runPromiseExit(decodeStripeJson(schema, reason, payload));
    if (Exit.isFailure(decoded)) {
      reportError(reason, decoded.cause);
      return null;
    }
    return decoded.value;
  } catch (error: unknown) {
    reportError(reason, error);
    return null;
  }
}

function billingCatalog(env: Env): BillingCatalog {
  return {
    proPriceId: env.STRIPE_PRO_PRICE_ID,
    teamPriceId: env.STRIPE_TEAM_PRICE_ID,
  };
}

/** Require an admin session plus a configured Stripe key; Response denies the caller. */
async function requireAdmin(request: Request, env: Env): Promise<AuthedSession | Response> {
  const authOrDenied = await authenticateSession(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;

  const adminExit = await Effect.runPromiseExit(isAdminCustomer(env.DB, authOrDenied.user.id));
  if (Exit.isFailure(adminExit)) {
    reportError('Billing admin authorization failed', adminExit.cause);
    return errorResponse('Admin authorization unavailable', 503);
  }
  if (!adminExit.value) {
    return errorResponse('Forbidden', 403);
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

const MAX_STRIPE_EVENT_ATTEMPTS = 20;

async function claimStripeEvent(
  db: D1Database,
  event: StripeWebhookEvent,
  eventData: string
): Promise<{
  outcome: 'claimed' | 'processed' | 'busy' | 'dead' | 'invalid';
  claimToken?: string;
}> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO stripe_events (
        id, stripe_event_id, event_type, event_data, processed, status, attempt_count
      ) VALUES (?, ?, ?, ?, 0, 'received', 0)`
    )
    .bind(crypto.randomUUID(), event.id, event.type, eventData)
    .run();

  const claimToken = crypto.randomUUID();
  // RETURNING makes the claim decision authoritative without relying on
  // meta.changes, which is not populated by every D1 runtime. The 5-minute
  // lease assumes every handler finishes well inside that window — a handler
  // running longer could be double-executed concurrently after reclaim.
  const claimed = await db
    .prepare(
      `UPDATE stripe_events
       SET status = 'processing', attempt_count = attempt_count + 1,
           processing_started_at = CURRENT_TIMESTAMP, last_error = NULL,
           claim_token = ?
       WHERE stripe_event_id = ? AND attempt_count < ? AND (
         status IN ('received', 'failed') OR
         (status = 'processing' AND processing_started_at < datetime('now', '-5 minutes'))
       )
       RETURNING stripe_event_id`
    )
    .bind(claimToken, event.id, MAX_STRIPE_EVENT_ATTEMPTS)
    .first();
  if (claimed !== null) {
    return { outcome: 'claimed', claimToken };
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
    return { outcome: 'invalid' };
  }
  return {
    outcome:
      stateLookup.value.processed === 1 || stateLookup.value.status === 'processed'
        ? 'processed'
        : stateLookup.value.status === 'dead'
          ? 'dead'
          : 'busy',
  };
}

async function markStripeEventProcessed(
  db: D1Database,
  eventId: string,
  claimToken: string | undefined
): Promise<void> {
  // Drop the raw signed payload once processed: it embeds full customer/
  // invoice objects (PII) and would otherwise grow stripe_events without
  // bound over the account's billing lifetime.
  await db
    .prepare(
      `UPDATE stripe_events SET processed = 1, status = 'processed',
         processed_at = CURRENT_TIMESTAMP, event_data = ''
       WHERE stripe_event_id = ? AND status = 'processing' AND claim_token IS ?`
    )
    .bind(eventId, claimToken ?? null)
    .run();
}

async function failedStripeEventResponse(
  db: D1Database,
  eventId: string,
  detail: string,
  claimToken?: string
): Promise<Response> {
  reportError(`Stripe webhook event ${eventId} processing failed`, detail);
  await db
    .prepare(
      `UPDATE stripe_events
       SET status = CASE WHEN attempt_count >= ? THEN 'dead' ELSE 'failed' END,
           processed = 0,
           processing_started_at = NULL,
           last_error = ?,
           event_data = CASE WHEN attempt_count >= ? THEN '' ELSE event_data END
       WHERE stripe_event_id = ? AND status = 'processing' AND claim_token IS ?`
    )
    .bind(
      MAX_STRIPE_EVENT_ATTEMPTS,
      detail.slice(0, 1000),
      MAX_STRIPE_EVENT_ATTEMPTS,
      eventId,
      claimToken ?? null
    )
    .run();
  return new Response('Stripe event reconciliation failed', { status: 500 });
}

/** Retention window for processed Stripe webhook inbox rows. */
const STRIPE_EVENT_RETENTION_DAYS = 90;

/**
 * Prune processed Stripe webhook inbox rows past the retention window.
 *
 * Raw event bodies were already truncated on completion (see
 * `markStripeEventProcessed`); this removes the rows themselves. Failed rows
 * are kept so persistent delivery failures stay diagnosable — Stripe gives up
 * retrying after 3 days, so their count stays small.
 */
export async function cleanupStripeEvents(db: D1Database): Promise<void> {
  await db
    .prepare(
      `DELETE FROM stripe_events
       WHERE processed = 1 AND processed_at < datetime('now', ?)`
    )
    .bind(`-${STRIPE_EVENT_RETENTION_DAYS} days`)
    .run();
  reportInfo('Cleaned up processed stripe_events rows');
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

    // Parse the Stripe signature header (format: t=timestamp,v1=signature,...).
    // Multiple v1 values are legitimate during signing-secret rotation; every
    // one must be accepted candidate. https://docs.stripe.com/webhooks
    const parts = new Map<string, string[]>();
    for (const part of signature.split(',')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      const values = parts.get(key) ?? [];
      values.push(value);
      parts.set(key, values);
    }

    const timestamp = parts.get('t')?.[0];
    const candidates = parts.get('v1') ?? [];

    if (!timestamp || candidates.length === 0) {
      reportError('Stripe signature missing timestamp or v1 signature');
      return false;
    }

    // Check timestamp to prevent replay attacks (5 minute tolerance).
    // Strict numeric parse: NaN would bypass the age predicate.
    const timestampNum = Number.parseInt(timestamp, 10);
    if (!Number.isInteger(timestampNum) || /[^0-9]/.test(timestamp)) {
      reportError('Stripe webhook timestamp malformed');
      return false;
    }
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

    // Timing-safe comparison against EACH candidate v1 signature; any match
    // validates the delivery (covers secret rotation windows).
    for (const expectedSig of candidates) {
      if (computedSig.length !== expectedSig.length) continue;
      let result = 0;
      for (let i = 0; i < computedSig.length; i++) {
        result |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
      }
      if (result === 0) return true;
    }
    return false;
  } catch (error: unknown) {
    reportError('Stripe signature verification error', error);
    return false;
  }
}

/**
 * Deterministic Stripe Idempotency-Key so double-taps and retries reuse one
 * Checkout Session instead of minting a new one per click. Rotates daily so a
 * deliberate later purchase of the same offer is never blocked.
 */
async function checkoutIdentity(
  userId: string,
  offer: string,
  promotionCode: string | undefined
): Promise<{ readonly idempotencyKey: string; readonly integrationIdentifier: string }> {
  const day = new Date().toISOString().slice(0, 10);
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`checkout:${userId}:${offer}:${promotionCode ?? 'standard'}:${day}`)
    )
  );
  const idempotencyKey = Array.from(digest.slice(0, 16))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  const suffix = Array.from(digest.slice(16, 24), byte =>
    String.fromCharCode('a'.charCodeAt(0) + (byte % 26))
  ).join('');
  return { idempotencyKey, integrationIdentifier: `omg_checkout_${suffix}` };
}

/** Stored Stripe customer id for an email, or a read failure marker. */
async function lookupStripeCustomerId(
  db: D1Database,
  email: string
): Promise<
  { readonly ok: true; readonly stripeCustomerId: string | null } | { readonly ok: false }
> {
  const row = await db
    .prepare('SELECT stripe_customer_id FROM customers WHERE email = ?')
    .bind(email.toLowerCase())
    .first();
  const lookup = await readOptionalExtraRow(
    StripeCustomerIdRowSchema,
    'Billing customer row has an invalid shape',
    row
  );
  if (lookup._tag === 'invalid') return { ok: false };
  return {
    ok: true,
    stripeCustomerId: lookup._tag === 'present' ? lookup.value.stripe_customer_id : null,
  };
}

/** Idempotent invoice upsert shared by webhook and admin-sync ingestion paths. */
function buildInvoiceUpsert(
  db: D1Database,
  invoice: {
    readonly stripeInvoiceId: string;
    readonly customerId: string;
    readonly amountCents: number | null;
    readonly currency: string | null;
    readonly status: string | null;
    readonly invoiceUrl: string | null;
    readonly invoicePdf: string | null;
    readonly periodStart: number | null;
    readonly periodEnd: number | null;
    readonly createdAtEpoch: number;
  }
): D1PreparedStatement {
  // COALESCE keeps previously stored URL/period fields when Stripe omits them
  // on a later delivery (webhook-first invoices keep fresh URLs after sync).
  return db
    .prepare(
      `INSERT INTO invoices (id, customer_id, stripe_invoice_id, amount_cents, currency, status, invoice_url, invoice_pdf, period_start, period_end, created_at)
       VALUES (COALESCE((SELECT id FROM invoices WHERE stripe_invoice_id = ?), ?), ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), datetime(?, 'unixepoch'))
       ON CONFLICT (id) DO UPDATE SET
         customer_id = excluded.customer_id,
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         status = excluded.status,
         invoice_url = COALESCE(excluded.invoice_url, invoices.invoice_url),
         invoice_pdf = COALESCE(excluded.invoice_pdf, invoices.invoice_pdf),
         period_start = COALESCE(excluded.period_start, invoices.period_start),
         period_end = COALESCE(excluded.period_end, invoices.period_end)`
    )
    .bind(
      invoice.stripeInvoiceId,
      crypto.randomUUID(),
      invoice.customerId,
      invoice.stripeInvoiceId,
      invoice.amountCents,
      invoice.currency,
      invoice.status,
      invoice.invoiceUrl,
      invoice.invoicePdf,
      invoice.periodStart,
      invoice.periodEnd,
      invoice.createdAtEpoch
    );
}

export async function handleCreateCheckout(
  request: Request,
  env: Env,
  stripeFetch: typeof fetch = fetch
): Promise<Response> {
  const authOrDenied = await authenticateSession(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;
  const auth = authOrDenied;

  const limited = await enforceRateLimit(env.API_RATE_LIMITER, `billing_checkout:${auth.user.id}`);
  if (limited !== null) {
    return limited;
  }

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, CheckoutRequestSchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid billing offer', 400);
  }
  const { offer, promotionCode } = decoded.value;
  const priceExit = await Effect.runPromiseExit(resolveBillingPrice(offer, billingCatalog(env)));
  if (Exit.isFailure(priceExit)) {
    return errorResponse('Billing offer unavailable', 503);
  }
  const priceId = priceExit.value;
  if (!env.STRIPE_SECRET_KEY) {
    return errorResponse('Billing is not configured', 503);
  }

  const email = auth.user.email.toLowerCase();
  const storedCustomer = await lookupStripeCustomerId(env.DB, email);
  if (!storedCustomer.ok) {
    return errorResponse('Failed to load billing account', 500);
  }

  let stripePromotionCodeId: string | null = null;
  if (promotionCode !== undefined) {
    const promotionRow = await env.DB.prepare(
      `SELECT stripe_promotion_code_id
       FROM marketing_offer_leads
       WHERE email = ? AND promotion_code = ? AND status = 'ready'
         AND datetime(expires_at) > CURRENT_TIMESTAMP`
    )
      .bind(email, promotionCode)
      .first();
    const promotionLookup = await readOptionalExtraRow(
      MarketingPromotionRowSchema,
      'Marketing promotion row has an invalid shape',
      promotionRow
    );
    if (promotionLookup._tag === 'invalid') {
      return errorResponse('Failed to load promotion code', 500);
    }
    const promotion = optionalRowValue(promotionLookup);
    if (promotion === undefined) {
      return errorResponse('Promotion code is not valid for this account', 400);
    }
    stripePromotionCodeId = promotion.stripe_promotion_code_id;
  }

  const identity = await checkoutIdentity(auth.user.id, offer, promotionCode);
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    integration_identifier: identity.integrationIdentifier,
    // The landing page hosts the post-checkout modal; the template lets it
    // correlate the redirect with a real Checkout Session instead of trusting
    // a forgeable ?success=true flag.
    success_url: 'https://omg.latham.cloud/?success=true&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://omg.latham.cloud/#pricing',
  });
  if (stripePromotionCodeId !== null) {
    params.set('discounts[0][promotion_code]', stripePromotionCodeId);
  }
  // Known buyers attach the stored Stripe customer so repeated checkouts do
  // not mint a fresh pending Customer object per attempt.
  if (storedCustomer.stripeCustomerId === null) {
    params.set('customer_email', email);
  } else {
    params.set('customer', storedCustomer.stripeCustomerId);
  }

  const session = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    'https://api.stripe.com/v1/checkout/sessions',
    StripeCheckoutSessionSchema,
    'Stripe checkout session has an invalid shape',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': identity.idempotencyKey,
        'Stripe-Version': '2026-07-29.dahlia',
      },
      body: params,
    },
    stripeFetch
  );
  if (!session) {
    return errorResponse('Failed to create checkout session', 502);
  }

  if (session.error) {
    return errorResponse(session.error.message, 502);
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

/**
 * Post-checkout fulfillment probe for the success modal.
 *
 * The caller must hold the same authenticated account session that created
 * checkout. Returns payment status and, once the signed webhook has provisioned
 * a license for that account, the license key itself. Entitlement enforcement
 * never depends on this endpoint — only webhook reconciliation grants tiers.
 */
export async function handleCheckoutSessionStatus(
  request: Request,
  env: Env,
  stripeFetch: typeof fetch = fetch
): Promise<Response> {
  const authOrDenied = await authenticateSession(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;
  const auth = authOrDenied;
  if (!env.STRIPE_SECRET_KEY) {
    return errorResponse('Billing is not configured', 503);
  }
  const limited = await enforceRateLimit(env.API_RATE_LIMITER, `checkout_session:${auth.user.id}`);
  if (limited !== null) {
    return limited;
  }

  const sessionId = URL.parse(request.url)?.searchParams.get('id') ?? null;
  if (sessionId === null || !CheckoutSessionIdPattern.test(sessionId)) {
    return errorResponse('Invalid checkout session id', 400);
  }

  const session = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    StripeCheckoutStatusSchema,
    'Stripe checkout session has an invalid shape',
    {},
    stripeFetch
  );
  if (!session) {
    // Unknown ids surface as Stripe error payloads; one generic upstream
    // failure covers both without revealing which session ids exist.
    return errorResponse('Unable to verify checkout session', 502);
  }

  const paymentStatus = session.payment_status ?? 'unknown';
  if (paymentStatus !== 'paid') {
    return jsonResponse({ status: paymentStatus });
  }

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  if (email !== null && email.toLowerCase() !== auth.user.email.toLowerCase()) {
    return errorResponse('Checkout session does not belong to this account', 403);
  }

  // Fulfillment is eventual: license rows are created by webhook projection,
  // so a paid session may briefly have nothing to hand out yet.
  const decodedCustomer = Schema.decodeEither(OptionalStripeReferenceId)(session.customer ?? null);
  const stripeCustomerId =
    decodedCustomer._tag === 'Right' && decodedCustomer.right !== null
      ? decodedCustomer.right
      : null;
  if (stripeCustomerId === null) {
    return jsonResponse({ status: paymentStatus, license: null });
  }

  const licenseRow = await env.DB.prepare(
    `SELECT l.license_key, l.tier FROM licenses l
     JOIN customers c ON l.customer_id = c.id
     WHERE c.id = ? AND c.stripe_customer_id = ? AND l.status = 'active'
     ORDER BY l.created_at DESC LIMIT 1`
  )
    .bind(auth.user.id, stripeCustomerId)
    .first();
  const lookup = await readOptionalExtraRow(
    LicenseKeyTierRowSchema,
    'License row has an invalid shape',
    licenseRow
  );
  if (lookup._tag === 'invalid') {
    reportError(`Checkout fulfillment license row has an invalid shape`, sessionId);
    return errorResponse('Internal server error', 500);
  }
  const license = optionalRowValue(lookup);
  return jsonResponse({
    status: paymentStatus,
    license:
      license === undefined ? null : { license_key: license.license_key, tier: license.tier },
  });
}

export async function handleBillingPortal(request: Request, env: Env): Promise<Response> {
  const authOrDenied = await authenticateSession(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;
  const auth = authOrDenied;

  const decoded = await Effect.runPromiseExit(decodeJsonBody(request, PortalBodySchema));
  if (Exit.isFailure(decoded)) {
    return errorResponse('Invalid JSON body', 400);
  }
  const requestedEmail = decoded.value.email;
  let email = auth.user.email.toLowerCase();
  if (requestedEmail !== undefined && requestedEmail !== email) {
    const denied = await forbiddenUnlessAdminSession(request, env);
    if (denied === null) {
      email = requestedEmail;
    }
  }

  const storedCustomer = await lookupStripeCustomerId(env.DB, email);
  if (!storedCustomer.ok) {
    return errorResponse('Failed to load billing account', 500);
  }
  if (storedCustomer.stripeCustomerId === null) {
    return errorResponse('No billing account found for this email', 404);
  }
  const stripeCustomerId = storedCustomer.stripeCustomerId;
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
    return errorResponse('Failed to create portal session', 502);
  }

  if (session.error || !session.url) {
    return errorResponse(session.error?.message || 'Failed to create portal session', 502);
  }

  await Effect.runPromise(
    logAudit(env.DB, auth.user.id, 'billing.portal_opened', 'portal', null, request, {
      target_email: email,
      stripe_customer_id: stripeCustomerId,
    })
  );

  return jsonResponse({ success: true, url: session.url });
}

/** A Stripe object reference: present after decoding or SQL null when absent. */
const OptionalStripeReferenceId = Schema.Union(
  Schema.Null,
  Schema.String.pipe(Schema.minLength(1))
);

/**
 * The subscription that generated an invoice, when the invoice is a
 * subscription invoice.
 *
 * Fields are already boundary-decoded (`StripeInvoiceFields`); this collapses
 * both wire shapes into one domain value. Pre-basil API versions carry
 * top-level `subscription`; basil (2025-03-31) deprecated it in favor of
 * `parent.subscription_details.subscription` guarded by `parent.type`
 * (docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects).
 */
function invoiceSubscriptionId(invoice: {
  readonly subscription?: string | null | undefined;
  readonly parent?:
    | {
        readonly type?: string | undefined;
        readonly subscription_details?:
          { readonly subscription?: string | null | undefined } | undefined;
      }
    | undefined;
}): string | undefined {
  const topLevel = Schema.decodeEither(OptionalStripeReferenceId)(invoice.subscription ?? null);
  if (topLevel._tag === 'Right' && topLevel.right !== null) return topLevel.right;
  if (invoice.parent?.type !== 'subscription_details') return undefined;
  const viaParent = Schema.decodeEither(OptionalStripeReferenceId)(
    invoice.parent.subscription_details?.subscription ?? null
  );
  return viaParent._tag === 'Right' && viaParent.right !== null ? viaParent.right : undefined;
}

export async function handleStripeWebhook(
  request: Request,
  env: Env,
  stripeFetch: StripeFetch = fetch
): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    reportWarning('Stripe webhook rejected: missing signature or secret');
    return new Response('Missing signature or secret', { status: 400 });
  }

  const body = await request.text();

  // Verify Stripe signature
  const isValid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    reportWarning('Stripe webhook rejected: signature verification failed');
    return new Response('Invalid signature', { status: 401 });
  }

  const decodedEvent = await Effect.runPromiseExit(decodeStripeWebhookText(body));
  if (Exit.isFailure(decodedEvent)) {
    return new Response('Invalid JSON', { status: 400 });
  }
  const event = decodedEvent.value;
  const claim = await claimStripeEvent(env.DB, event, body);
  const claimToken = claim.claimToken;
  if (claim.outcome === 'processed') {
    return new Response('OK');
  }
  if (claim.outcome === 'dead') {
    // Acknowledge terminal poison events so Stripe stops redelivering them.
    // The final failed attempt was already reported and its bounded error is
    // retained in the inbox while the raw PII-bearing payload is cleared.
    return new Response('Event permanently failed');
  }
  if (claim.outcome === 'busy') {
    return new Response('Event processing in progress', {
      status: 409,
      headers: { 'Retry-After': '5' },
    });
  }
  if (claim.outcome === 'invalid') {
    return new Response('Failed to load webhook inbox', { status: 500 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscriptionId = event.data.object.id;
        if (subscriptionId === undefined || subscriptionId.length === 0) {
          return failedStripeEventResponse(
            env.DB,
            event.id,
            'Subscription event has no object id',
            claimToken
          );
        }

        await reconcileStripeSubscriptionSignal(
          env.DB,
          subscriptionId,
          env.STRIPE_SECRET_KEY,
          billingCatalog(env),
          stripeFetch
        );
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.id === undefined || invoice.id.length === 0) {
          return failedStripeEventResponse(
            env.DB,
            event.id,
            'Invoice event has no object id',
            claimToken
          );
        }
        // One-off (non-subscription) invoices are deliberately ignored, not
        // retried: the invoices table feeds subscription revenue views, and
        // payment failures on one-offs say nothing about license health.
        if (invoiceSubscriptionId(invoice) === undefined) {
          reportInfo(`Ignoring non-subscription Stripe invoice ${invoice.id} (${event.type})`);
          break;
        }
        const resolved = await resolveStripeCustomerId(env.DB, invoice.customer);
        if (!resolved.ok) {
          if (resolved.reason === 'invalid-row') {
            return failedStripeEventResponse(
              env.DB,
              event.id,
              'Customer row has an invalid shape',
              claimToken
            );
          }
          // Unlinked customers must retry instead of being marked processed:
          // Stripe does not guarantee delivery order, so the linking event
          // (customer.created / first reconciliation) may arrive after this
          // invoice. Consuming it here would drop the revenue record forever.
          return failedStripeEventResponse(
            env.DB,
            event.id,
            'Stripe customer is not linked to a local customer yet',
            claimToken
          );
        }

        if (event.type === 'invoice.paid') {
          await buildInvoiceUpsert(env.DB, {
            stripeInvoiceId: invoice.id,
            customerId: resolved.customerId,
            amountCents: invoice.amount_paid ?? null,
            currency: invoice.currency ?? null,
            status: invoice.status ?? null,
            invoiceUrl: invoice.hosted_invoice_url ?? null,
            invoicePdf: invoice.invoice_pdf ?? null,
            periodStart: invoice.period_start ?? null,
            periodEnd: invoice.period_end ?? null,
            createdAtEpoch: invoice.created ?? Math.floor(Date.now() / 1000),
          }).run();
        } else {
          // Preserve the historical payment signal without mutating current
          // subscription state.
          await env.DB.prepare(
            `INSERT INTO audit_log (id, customer_id, action, metadata, created_at)
             VALUES (?, ?, 'billing.payment_failed', ?, datetime('now'))`
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
          return failedStripeEventResponse(
            env.DB,
            event.id,
            'Customer row has an invalid shape',
            claimToken
          );
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
        // Unknown-but-real Stripe event types are durable no-ops so Stripe does
        // not retry them indefinitely; surface them so flows like refunds or
        // paused subscriptions get implemented instead of vanishing silently.
        reportWarning(`Unhandled Stripe webhook event type: ${event.type}`);
        break;
    }
  } catch (error: unknown) {
    // Any thrown store error must release the inbox claim via the failed path;
    // escaping would wedge the event in status='processing' until lease expiry
    // and turn every Stripe retry into a 409 storm.
    return failedStripeEventResponse(
      env.DB,
      event.id,
      decodeThrownMessage(error) || 'Unknown webhook processing failure',
      claimToken
    );
  }

  await markStripeEventProcessed(env.DB, event.id, claimToken);
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
        if (!customer.email) {
          errors.push(`Customer ${customer.id}: Stripe customer has no email`);
          return false;
        }
        // Explicit select-then-update/insert preserves the existing customer id:
        // INSERT OR REPLACE would delete-and-reinsert the parent row that every
        // ON DELETE CASCADE child (licenses, subscriptions, machines) hangs off.
        const existingRow = await env.DB.prepare(
          'SELECT id FROM customers WHERE stripe_customer_id = ? OR email = ?'
        )
          .bind(customer.id, customer.email)
          .first();
        const existingLookup = await readOptionalExtraRow(
          IdRowSchema,
          'Customer id row has an invalid shape',
          existingRow
        );
        if (existingLookup._tag === 'invalid') {
          errors.push(`Customer ${customer.email}: customer row has an invalid shape`);
          return false;
        }
        const company = customer.metadata?.company ?? null;
        const existing = optionalRowValue(existingLookup);
        if (existing === undefined) {
          await env.DB.prepare(
            `INSERT INTO customers (id, stripe_customer_id, email, company, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
          )
            .bind(crypto.randomUUID(), customer.id, customer.email, company)
            .run();
        } else {
          await env.DB.prepare(
            'UPDATE customers SET stripe_customer_id = ?, email = ?, company = COALESCE(?, company) WHERE id = ?'
          )
            .bind(customer.id, customer.email, company, existing.id)
            .run();
        }
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
        // Mirror the webhook gate: only subscription invoices belong in the
        // revenue-facing invoices table; one-offs are skipped without error.
        if (invoice.status !== 'paid' || invoiceSubscriptionId(invoice) === undefined) {
          return false;
        }

        const resolved = await resolveStripeCustomerId(env.DB, invoice.customer);
        if (!resolved.ok) {
          if (resolved.reason === 'invalid-row') {
            errors.push(`Invoice ${invoice.id}: customer row has an invalid shape`);
          }
          return false;
        }
        await buildInvoiceUpsert(env.DB, {
          stripeInvoiceId: invoice.id,
          customerId: resolved.customerId,
          amountCents: invoice.amount_paid ?? null,
          currency: invoice.currency ?? null,
          status: invoice.status ?? null,
          invoiceUrl: invoice.hosted_invoice_url ?? null,
          invoicePdf: invoice.invoice_pdf ?? null,
          periodStart: invoice.period_start ?? null,
          periodEnd: invoice.period_end ?? null,
          createdAtEpoch: invoice.created ?? Math.floor(Date.now() / 1000),
        }).run();
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
 *
 * MRR math operates on fully-typed subscription items: recurring amounts are
 * normalized to a monthly value per interval (month/year/week/day), one-time
 * items are excluded from recurring revenue, each subscription is classified
 * into a tier exactly once via server-owned price IDs, and everything is
 * paginated past Stripe's 100-item page cap. Only USD amounts are summed;
 * mixing currencies into one number would be fiction.
 */
const MetricsPriceSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  unit_amount: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  currency: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
  recurring: Schema.optional(
    Schema.Struct({
      interval: Schema.optional(Schema.String),
      interval_count: Schema.optional(Schema.Number),
    })
  ),
});

const MetricsItemSchema = Schema.Struct({
  quantity: Schema.optional(Schema.Union(Schema.Null, Schema.Number)),
  price: MetricsPriceSchema,
});

const MetricsSubscriptionSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  items: Schema.Struct({
    data: Schema.Array(MetricsItemSchema),
  }),
});

const MetricsListSchema = Schema.Struct({
  has_more: Schema.Boolean,
  data: Schema.Array(MetricsSubscriptionSchema),
});

const BalanceFundsSchema = Schema.Struct({
  amount: Schema.Number,
  currency: Schema.optional(Schema.Union(Schema.Null, Schema.String)),
});

const BalanceSchema = Schema.Struct({
  available: Schema.Array(BalanceFundsSchema),
  pending: Schema.Array(BalanceFundsSchema),
});

type MetricsPrice = Schema.Schema.Type<typeof MetricsPriceSchema>;

type BalanceFunds = Schema.Schema.Type<typeof BalanceFundsSchema>;

/** Sum only USD funds so the reported balance matches its `currency` label. */
function usdTotal(funds: ReadonlyArray<BalanceFunds>): number {
  return funds.filter(fund => fund.currency === 'usd').reduce((sum, fund) => sum + fund.amount, 0);
}

type MetricsTier = 'pro' | 'team' | 'enterprise';

/** Monthly-normalized cents for a recurring price; null for one-time prices. */
function monthlyNormalizedCents(price: MetricsPrice): number | null {
  const recurring = price.recurring;
  if (recurring === undefined) return null;
  const amount = price.unit_amount ?? 0;
  const count = recurring.interval_count ?? 1;
  if (!Number.isInteger(count) || count <= 0) return null;
  switch (recurring.interval) {
    case 'month':
      return amount / count;
    case 'year':
      return amount / (12 * count);
    case 'week':
      return (amount * 52) / (12 * count);
    case 'day':
      return (amount * 365) / (12 * count);
    default:
      return null;
  }
}

/**
 * Classify a price by the server-owned catalog. Prices outside it get no tier
 * bucket — an amount heuristic would let any custom >= $200/mo price inflate
 * "enterprise".
 */
function classifyPriceTier(
  priceId: string,
  catalog: BillingCatalog,
  enterprisePriceId: string | undefined
): MetricsTier | undefined {
  if (catalog.proPriceId !== undefined && priceId === catalog.proPriceId) return 'pro';
  if (catalog.teamPriceId !== undefined && priceId === catalog.teamPriceId) return 'team';
  if (enterprisePriceId !== undefined && priceId === enterprisePriceId) return 'enterprise';
  return undefined;
}

export async function handleAdminStripeMetrics(request: Request, env: Env): Promise<Response> {
  const authOrDenied = await requireAdmin(request, env);
  if (authOrDenied instanceof Response) return authOrDenied;

  const catalog = billingCatalog(env);
  let mrrCents = 0;
  let activeSubscriptions = 0;
  const tierCounts = { pro: 0, team: 0, enterprise: 0 } satisfies Record<MetricsTier, number>;
  let startingAfter: string | undefined;

  for (;;) {
    const url = URL.parse('https://api.stripe.com/v1/subscriptions');
    if (url === null) {
      return errorResponse('Failed to load Stripe metrics', 500);
    }
    url.searchParams.set('status', 'active');
    url.searchParams.set('limit', '100');
    if (startingAfter !== undefined) url.searchParams.set('starting_after', startingAfter);

    const page = await fetchStripeJson(
      env.STRIPE_SECRET_KEY,
      url,
      MetricsListSchema,
      'Stripe metrics subscription list has an invalid shape'
    );
    if (!page) {
      return errorResponse('Failed to load Stripe metrics', 502);
    }

    for (const sub of page.data) {
      activeSubscriptions++;
      let tierAssigned = false;
      for (const item of sub.items.data) {
        const monthly = monthlyNormalizedCents(item.price);
        if (monthly !== null && item.price.currency === 'usd') {
          mrrCents += monthly * (item.quantity ?? 1);
        }
        // Tier is counted once per subscription even when it carries multiple
        // items, keeping tier_breakdown consistent with active_subscriptions.
        if (!tierAssigned) {
          const tier = classifyPriceTier(item.price.id, catalog, env.STRIPE_ENT_PRICE_ID);
          if (tier !== undefined) {
            tierCounts[tier]++;
            tierAssigned = true;
          }
        }
      }
    }

    if (!page.has_more) break;
    const cursor = page.data.at(-1)?.id;
    if (cursor === undefined) {
      return errorResponse('Failed to load Stripe metrics', 502);
    }
    startingAfter = cursor;
  }

  // Fetch recent balance (available + pending)
  const balance = await fetchStripeJson(
    env.STRIPE_SECRET_KEY,
    'https://api.stripe.com/v1/balance',
    BalanceSchema,
    'Stripe balance has an invalid shape'
  );
  if (!balance) {
    return errorResponse('Failed to load Stripe balance', 502);
  }

  const availableBalance = usdTotal(balance.available);
  const pendingBalance = usdTotal(balance.pending);

  return jsonResponse({
    mrr: Math.round(mrrCents),
    arr: Math.round(mrrCents * 12),
    active_subscriptions: activeSubscriptions,
    tier_breakdown: tierCounts,
    balance: {
      available: availableBalance,
      pending: pendingBalance,
      currency: 'usd',
    },
  });
}
