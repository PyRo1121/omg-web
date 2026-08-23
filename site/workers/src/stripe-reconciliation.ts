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
  type BillingCatalog,
  type BillingEntitlement,
} from './contracts/billing-offer';
import {
  decodeStripeJson,
  StripeCustomerEmailSchema,
  StripeSubscriptionSchema,
  type StripeSubscription,
  type StripeSubscriptionStatus,
} from './contracts/stripe';

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

function subscriptionGrantsAccess(status: StripeSubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

async function currentStripeSubscription(
  subscriptionId: string,
  secret: string,
  stripeFetch: StripeFetch
): Promise<StripeSubscription> {
  const response = await stripeFetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  if (!response.ok) {
    throw new StripeReconciliationError(
      `Unable to load current Stripe subscription ${subscriptionId}`
    );
  }
  return readStripeJson(
    response,
    StripeSubscriptionSchema,
    'Current Stripe subscription has an invalid shape'
  );
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

async function activeSubscriptionEntitlement(
  subscription: StripeSubscription,
  catalog: BillingCatalog
): Promise<BillingEntitlement> {
  let entitlement: BillingEntitlement | undefined;
  for (const item of subscription.items.data) {
    const resolved = await Effect.runPromiseExit(resolveBillingEntitlement(item.price.id, catalog));
    if (Exit.isFailure(resolved)) {
      continue;
    }
    if (entitlement !== undefined) {
      throw new BillingEntitlementUnavailable(
        item.price.id,
        new Error('Subscription contains multiple recognized billing prices')
      );
    }
    entitlement = resolved.value;
  }
  if (entitlement === undefined) {
    throw new BillingEntitlementUnavailable(
      subscription.id,
      new Error('Active subscription has no recognized billing price')
    );
  }
  return entitlement;
}

/** Atomically project one current Stripe subscription into customer, license, and subscription state. */
export async function applyStripeSubscriptionProjection(
  db: D1Database,
  customerId: string,
  subscription: StripeSubscription,
  catalog: BillingCatalog
): Promise<void> {
  const entitlement = subscriptionGrantsAccess(subscription.status)
    ? await activeSubscriptionEntitlement(subscription, catalog)
    : undefined;
  const customerTier = entitlement?.tier ?? 'free';
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO subscriptions (
           id, customer_id, stripe_subscription_id, status, current_period_end
         ) VALUES (?, ?, ?, ?, datetime(?, 'unixepoch'))
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           customer_id = excluded.customer_id,
           status = excluded.status,
           current_period_end = excluded.current_period_end
           WHERE excluded.current_period_end >= subscriptions.current_period_end`
      )
      .bind(
        crypto.randomUUID(),
        customerId,
        subscription.id,
        subscription.status,
        subscription.current_period_end
      ),
    db
      .prepare(`UPDATE customers SET tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(customerTier, customerId),
  ];

  if (entitlement === undefined) {
    statements.push(
      db
        .prepare(
          `UPDATE licenses
           SET status = 'cancelled', expires_at = datetime(?, 'unixepoch')
           WHERE customer_id = ?`
        )
        .bind(subscription.current_period_end, customerId)
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE licenses
           SET tier = ?, status = 'active', max_seats = ?, max_machines = ?,
               expires_at = datetime(?, 'unixepoch')
           WHERE customer_id = ?`
        )
        .bind(
          entitlement.tier,
          entitlement.maxSeats,
          entitlement.maxSeats,
          subscription.current_period_end,
          customerId
        ),
      db
        .prepare(
          `INSERT INTO licenses (
             id, customer_id, license_key, tier, status, max_seats, max_machines, expires_at
           )
           SELECT ?, ?, ?, ?, 'active', ?, ?, datetime(?, 'unixepoch')
           WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE customer_id = ?)`
        )
        .bind(
          crypto.randomUUID(),
          customerId,
          crypto.randomUUID(),
          entitlement.tier,
          entitlement.maxSeats,
          entitlement.maxSeats,
          subscription.current_period_end,
          customerId
        )
    );
  }

  await db.batch(statements);
}

/** Pull Stripe's current object and reconcile it instead of trusting webhook delivery order. */
export async function reconcileStripeSubscriptionSignal(
  db: D1Database,
  subscriptionId: string,
  secret: string,
  catalog: BillingCatalog,
  stripeFetch: StripeFetch
): Promise<void> {
  const subscription = await currentStripeSubscription(subscriptionId, secret, stripeFetch);
  const customer = await ensureBillingCustomer(db, subscription.customer, secret, stripeFetch);
  await applyStripeSubscriptionProjection(db, customer.id, subscription, catalog);
}
