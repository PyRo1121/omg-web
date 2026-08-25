import { Effect, Exit } from 'effect';
import type * as Schema from 'effect/Schema';
import {
  BillingCustomerRowSchema,
  type BillingCustomerRow,
  readOptionalExtraRow,
} from './contracts/d1-extras';
import {
  BillingEntitlementUnavailable,
  resolveBillingEntitlement,
  resolveBillingPrice,
  type BillingCatalog,
  type BillingEntitlement,
  type BillingOffer,
} from './contracts/billing-offer';
import { logAudit } from './api';
import {
  decodeStripeJson,
  StripeCustomerEmailSchema,
  StripeSubscriptionSchema,
  type StripeSubscription,
} from './contracts/stripe';

/**
 * Terminal subscription states outrank transient ones so a stale concurrent
 * snapshot can never resurrect a canceled subscription at equal period end.
 *
 * Must stay in lockstep with the SQL CASE expression in
 * migrations/017_subscription_status_rank.sql — a new rank level added in one
 * place silently desyncs projections in the other.
 */
function statusRank(status: string): number {
  if (status === 'canceled') return 3;
  if (status === 'unpaid' || status === 'past_due' || status === 'incomplete_expired') return 2;
  if (status === 'active' || status === 'trialing' || status === 'incomplete') return 1;
  return 0;
}

export type StripeFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Current Stripe state or local projection could not be reconciled safely. */
export class StripeReconciliationError extends Error {
  readonly _tag = 'StripeReconciliationError';

  constructor(
    readonly detail: string,
    override readonly cause?: unknown
  ) {
    super(detail);
  }
}

async function readStripeJson<S extends Schema.Schema.AnyNoContext>(
  response: Response,
  schema: S,
  reason: string
): Promise<Schema.Schema.Type<S>> {
  const payload: unknown = await response.json();
  const decoded = await Effect.runPromiseExit(decodeStripeJson(schema, reason, payload));
  if (Exit.isFailure(decoded)) {
    throw new StripeReconciliationError(reason, decoded.cause);
  }
  return decoded.value;
}

async function ensureBillingCustomer(
  db: D1Database,
  stripeCustomerId: string,
  secret: string,
  stripeFetch: StripeFetch
): Promise<BillingCustomerRow> {
  const customerRow = await db
    .prepare('SELECT id, email, stripe_customer_id FROM customers WHERE stripe_customer_id = ?')
    .bind(stripeCustomerId)
    .first();
  const customerLookup = await readOptionalExtraRow(
    BillingCustomerRowSchema,
    'Billing customer row has an invalid shape',
    customerRow
  );
  if (customerLookup._tag === 'invalid') {
    throw new StripeReconciliationError('Billing customer row has an invalid shape');
  }
  if (customerLookup._tag === 'present') {
    return customerLookup.value;
  }

  const stripeCustomerResponse = await stripeFetch(
    `https://api.stripe.com/v1/customers/${encodeURIComponent(stripeCustomerId)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  if (!stripeCustomerResponse.ok) {
    throw new StripeReconciliationError(`Unable to reconcile Stripe customer ${stripeCustomerId}`);
  }
  const stripeCustomer = await readStripeJson(
    stripeCustomerResponse,
    StripeCustomerEmailSchema,
    'Stripe customer lookup has an invalid shape'
  );

  const emailRow = await db
    .prepare('SELECT id, email, stripe_customer_id FROM customers WHERE email = ?')
    .bind(stripeCustomer.email)
    .first();
  const emailLookup = await readOptionalExtraRow(
    BillingCustomerRowSchema,
    'Billing customer email row has an invalid shape',
    emailRow
  );
  if (emailLookup._tag === 'invalid') {
    throw new StripeReconciliationError('Billing customer email row has an invalid shape');
  }
  if (emailLookup._tag === 'present') {
    await db
      .prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?')
      .bind(stripeCustomerId, emailLookup.value.id)
      .run();
    return { ...emailLookup.value, stripe_customer_id: stripeCustomerId };
  }

  const customerId = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO customers (id, stripe_customer_id, email, tier) VALUES (?, ?, ?, 'free')`)
    .bind(customerId, stripeCustomerId, stripeCustomer.email)
    .run();
  return { id: customerId, email: stripeCustomer.email, stripe_customer_id: stripeCustomerId };
}

/** Resolve one catalog offer to its Stripe price id and canonical seat limit. */
async function catalogArm(
  catalog: BillingCatalog,
  offer: BillingOffer
): Promise<{ readonly priceId: string; readonly maxSeats: number } | undefined> {
  const priceExit = await Effect.runPromiseExit(resolveBillingPrice(offer, catalog));
  if (Exit.isFailure(priceExit)) return undefined;
  const entitlementExit = await Effect.runPromiseExit(
    resolveBillingEntitlement(priceExit.value, catalog)
  );
  if (Exit.isFailure(entitlementExit)) return undefined;
  return { priceId: priceExit.value, maxSeats: entitlementExit.value.maxSeats };
}

/**
 * Validate the projected subscription against the catalog.
 *
 * An active subscription must map onto exactly one recognized billing price;
 * anything else is a loud configuration error, not a silent downgrade.
 * Returns the recognized price id so the projection stores the price that
 * actually grants the tier — never an unrecognized co-resident item
 * (`items.data[0]` alone would break tier SQL for mixed-item subscriptions).
 */
interface ProjectedSubscriptionEntitlement {
  readonly entitlement: BillingEntitlement;
  readonly priceId: string;
}

async function resolveProjectedEntitlement(
  subscription: StripeSubscription,
  catalog: BillingCatalog
): Promise<ProjectedSubscriptionEntitlement | undefined> {
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return undefined;
  }
  let recognized: ProjectedSubscriptionEntitlement | undefined;
  for (const item of subscription.items.data) {
    const resolved = await Effect.runPromiseExit(resolveBillingEntitlement(item.price.id, catalog));
    if (Exit.isFailure(resolved)) continue;
    if (recognized !== undefined) {
      throw new BillingEntitlementUnavailable(
        item.price.id,
        new Error('Subscription contains multiple recognized billing prices')
      );
    }
    recognized = { entitlement: resolved.value, priceId: item.price.id };
  }
  if (recognized === undefined) {
    throw new BillingEntitlementUnavailable(
      subscription.id,
      new Error('Active subscription has no recognized billing price')
    );
  }
  return recognized;
}

/**
 * Effective-tier SQL fragment correlated on `${correlation}` (a column
 * reference like `licenses.customer_id`). Consumes [teamPriceId, proPriceId]
 * binds in that order.
 */
function effectiveTierFor(correlation: string): string {
  return `CASE WHEN EXISTS(SELECT 1 FROM subscriptions s
      WHERE s.customer_id = ${correlation}
        AND s.status IN ('active', 'trialing')
        AND s.stripe_price_id = ?) THEN 'team'
     WHEN EXISTS(SELECT 1 FROM subscriptions s
      WHERE s.customer_id = ${correlation}
        AND s.status IN ('active', 'trialing')
        AND s.stripe_price_id = ?) THEN 'pro'
     ELSE 'free' END`;
}

/**
 * Atomically project one current Stripe subscription into customer, license,
 * and subscription state.
 *
 * Entitlements are derived from the AGGREGATE of all stored subscription rows
 * for the customer inside the same D1 batch, not from the projected snapshot:
 * Stripe does not guarantee delivery order, so `S1.deleted` (cancel) racing
 * `S2.created` (rebuy) must never downgrade a still-paid entitlement, and the
 * admin sync projecting an old canceled subscription last must not clobber the
 * active one. All statements share one serialized batch, so concurrent webhook
 * deliveries converge on the same aggregate answer.
 */
export async function applyStripeSubscriptionProjection(
  db: D1Database,
  customerId: string,
  subscription: StripeSubscription,
  catalog: BillingCatalog
): Promise<void> {
  const projected = await resolveProjectedEntitlement(subscription, catalog);

  const pro = await catalogArm(catalog, 'pro');
  const team = await catalogArm(catalog, 'team');
  // Empty strings can never equal a stored Stripe price id, so an unconfigured
  // catalog arm simply never matches in the SQL below.
  const proPriceId = pro?.priceId ?? '';
  const teamPriceId = team?.priceId ?? '';
  const proSeats = pro?.maxSeats ?? 0;
  const teamSeats = team?.maxSeats ?? 0;

  // SQL fragments shared by the entitlement writes, fully parameterized with
  // `?` binds; see each statement's .bind() for exact ordering. "Active" means
  // the row's status grants service today; tier precedence is team > pro
  // because it is the higher catalog tier.
  const activeTeam = `EXISTS(SELECT 1 FROM subscriptions s
     WHERE s.customer_id = ? AND s.status IN ('active', 'trialing')
       AND s.stripe_price_id = ?)`;
  const activePro = `EXISTS(SELECT 1 FROM subscriptions s
     WHERE s.customer_id = ? AND s.status IN ('active', 'trialing')
       AND s.stripe_price_id = ?)`;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO subscriptions (
           id, customer_id, stripe_subscription_id, stripe_price_id,
           status, current_period_end, status_rank
         ) VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           customer_id = excluded.customer_id,
           stripe_price_id = excluded.stripe_price_id,
           status = excluded.status,
           current_period_end = excluded.current_period_end,
           status_rank = excluded.status_rank
           WHERE excluded.current_period_end > subscriptions.current_period_end
              OR (
                excluded.current_period_end = subscriptions.current_period_end
                AND excluded.status_rank >= subscriptions.status_rank
              )`
      )
      .bind(
        crypto.randomUUID(),
        customerId,
        subscription.id,
        // Store the recognized catalog price so tier SQL matches; fall back to
        // the first item only for non-active subscriptions (no tier impact).
        projected?.priceId ?? subscription.items.data[0]?.price.id ?? null,
        subscription.status,
        subscription.current_period_end,
        statusRank(subscription.status)
      ),
    db
      .prepare(
        `UPDATE customers
         SET tier = (${effectiveTierFor('customers.id')}),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(teamPriceId, proPriceId, customerId),
    db
      .prepare(
        `UPDATE licenses SET
           tier = (${effectiveTierFor('licenses.customer_id')}),
           status = CASE WHEN ${activeTeam} OR ${activePro}
                         THEN 'active' ELSE 'cancelled' END,
           max_seats = CASE WHEN ${activeTeam} THEN ?
                            WHEN ${activePro} THEN ?
                            ELSE max_seats END,
           max_machines = CASE WHEN ${activeTeam} THEN ?
                               WHEN ${activePro} THEN ?
                               ELSE max_machines END,
           expires_at = COALESCE(
             (SELECT MAX(s.current_period_end) FROM subscriptions s
              WHERE s.customer_id = licenses.customer_id
                AND s.status IN ('active', 'trialing')),
             (SELECT MAX(s.current_period_end) FROM subscriptions s
              WHERE s.customer_id = licenses.customer_id)
           )
         WHERE customer_id = ?`
      )
      .bind(
        teamPriceId,
        proPriceId, // tier CASE
        customerId,
        teamPriceId,
        customerId,
        proPriceId, // status CASE
        customerId,
        teamPriceId,
        teamSeats,
        customerId,
        proPriceId,
        proSeats, // max_seats CASE
        customerId,
        teamPriceId,
        teamSeats,
        customerId,
        proPriceId,
        proSeats, // max_machines CASE
        customerId // WHERE
      ),
    db
      .prepare(
        `INSERT INTO licenses (
           id, customer_id, license_key, tier, status, max_seats, max_machines, expires_at
         )
         SELECT ?, ?, ?,
                (${effectiveTierFor('?')}),
                'active',
                CASE WHEN ${activeTeam} THEN ?
                     WHEN ${activePro} THEN ?
                     ELSE 1 END,
                CASE WHEN ${activeTeam} THEN ?
                     WHEN ${activePro} THEN ?
                     ELSE 1 END,
                COALESCE(
                  (SELECT MAX(s.current_period_end) FROM subscriptions s
                   WHERE s.customer_id = ? AND s.status IN ('active', 'trialing')),
                  (SELECT MAX(s.current_period_end) FROM subscriptions s
                   WHERE s.customer_id = ?)
                )
         WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE customer_id = ?)
           AND (${activeTeam} OR ${activePro})`
      )
      .bind(
        crypto.randomUUID(),
        customerId,
        crypto.randomUUID(),
        customerId,
        teamPriceId,
        customerId,
        proPriceId, // tier CASE
        customerId,
        teamPriceId,
        teamSeats,
        customerId,
        proPriceId,
        proSeats, // max_seats CASE
        customerId,
        teamPriceId,
        teamSeats,
        customerId,
        proPriceId,
        proSeats, // max_machines CASE
        customerId,
        customerId, // expires_at COALESCE
        customerId, // NOT EXISTS guard
        customerId,
        teamPriceId,
        customerId,
        proPriceId // active-guard
      ),
  ];

  await db.batch(statements);

  await Effect.runPromise(
    logAudit(
      db,
      customerId,
      'billing.subscription_reconciled',
      'subscription',
      subscription.id,
      undefined,
      { status: subscription.status }
    )
  );
}

/** Pull Stripe's current object and reconcile it instead of trusting webhook delivery order. */
export async function reconcileStripeSubscriptionSignal(
  db: D1Database,
  subscriptionId: string,
  secret: string,
  catalog: BillingCatalog,
  stripeFetch: StripeFetch
): Promise<void> {
  const response = await stripeFetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  if (!response.ok) {
    throw new StripeReconciliationError(
      `Unable to load current Stripe subscription ${subscriptionId}`
    );
  }
  const subscription = await readStripeJson(
    response,
    StripeSubscriptionSchema,
    'Current Stripe subscription has an invalid shape'
  );
  const customer = await ensureBillingCustomer(db, subscription.customer, secret, stripeFetch);
  await applyStripeSubscriptionProjection(db, customer.id, subscription, catalog);
}
