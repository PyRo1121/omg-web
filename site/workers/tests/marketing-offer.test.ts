import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/api';
import { handleCreateCheckout } from '../src/handlers/billing';
import { handleMarketingOffer } from '../src/handlers/marketing-offer';

const INTERNAL_SECRET = 'test-internal-secret';
const SVELTE_BFF_SECRET = 'test-svelte-bff-secret';

function offerEnv(rateLimitSuccess = true, ipLimitSuccess = true): Env {
  return {
    DB: env.DB,
    EMAIL: env.EMAIL,
    STRIPE_SECRET_KEY: 'stripe-test-key',
    STRIPE_WEBHOOK_SECRET: 'webhook-test-secret',
    STRIPE_INTRO_COUPON_ID: 'coupon_intro_test',
    JWT_SECRET: 'jwt-test-secret',
    JWT_PRIVATE_KEY: 'private-test-key',
    ADMIN_API_SECRET: INTERNAL_SECRET,
    SVELTE_BFF_SECRET,
    API_RATE_LIMITER: {
      limit: async () => ({ success: ipLimitSuccess }),
    },
    OFFER_RATE_LIMITER: {
      limit: async () => ({ success: rateLimitSuccess }),
    },
  };
}

function offerRequest(email: string, secret = INTERNAL_SECRET): Request {
  return new Request('https://omg-saas.internal/api/internal/marketing-offer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': secret,
      'X-Internal-Call': 'service-binding',
      'X-Offer-Visitor-IP': '192.0.2.10',
    },
    body: JSON.stringify({ email }),
  });
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM marketing_offer_leads').run();
});

describe('marketing introductory offer', () => {
  it('rate limits the public route before comparing its shared secret', async () => {
    const response = await handleMarketingOffer(
      offerRequest('developer@example.com', 'wrong-secret'),
      offerEnv(true, false)
    );

    expect(response.status).toBe(429);
  });

  it('accepts the independent Svelte BFF secret over a private binding', async () => {
    const response = await handleMarketingOffer(
      offerRequest('developer@example.com', SVELTE_BFF_SECRET),
      offerEnv(),
      async (_input, init) => {
        const body = new URLSearchParams(String(init?.body));
        return Response.json({ id: 'promo_svelte', code: body.get('code'), active: true });
      }
    );

    expect(response.status).toBe(200);
  });

  it('creates one single-redemption Stripe promotion and reuses it for the email', async () => {
    const stripeFetch = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('promotion[type]')).toBe('coupon');
      expect(body.get('promotion[coupon]')).toBe('coupon_intro_test');
      expect(body.get('max_redemptions')).toBe('1');
      expect(body.get('restrictions[first_time_transaction]')).toBe('true');
      return Response.json({
        id: 'promo_test_1',
        code: body.get('code'),
        active: true,
      });
    });

    const first = await handleMarketingOffer(
      offerRequest('Developer@Example.com'),
      offerEnv(),
      stripeFetch
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      percentOff: 20,
      durationMonths: 3,
    });

    const second = await handleMarketingOffer(
      offerRequest('developer@example.com'),
      offerEnv(),
      stripeFetch
    );
    expect(second.status).toBe(200);
    expect(stripeFetch).toHaveBeenCalledTimes(1);
    expect(await second.json()).toMatchObject({ percentOff: 20, durationMonths: 3 });

    const row = await env.DB.prepare(
      `SELECT email, status, stripe_promotion_code_id FROM marketing_offer_leads`
    ).first();
    expect(row).toMatchObject({
      email: 'developer@example.com',
      status: 'ready',
      stripe_promotion_code_id: 'promo_test_1',
    });
  });

  it('rejects invalid email before contacting Stripe', async () => {
    const stripeFetch = vi.fn<typeof fetch>();
    const response = await handleMarketingOffer(
      offerRequest('not-an-email'),
      offerEnv(),
      stripeFetch
    );
    expect(response.status).toBe(400);
    expect(stripeFetch).not.toHaveBeenCalled();
  });

  it('fails closed without the internal secret', async () => {
    const response = await handleMarketingOffer(
      offerRequest('developer@example.com', 'wrong-secret'),
      offerEnv(),
      vi.fn<typeof fetch>()
    );
    expect(response.status).toBe(404);
  });

  it('enforces the dedicated offer rate limiter', async () => {
    const response = await handleMarketingOffer(
      offerRequest('developer@example.com'),
      offerEnv(false),
      vi.fn<typeof fetch>()
    );
    expect(response.status).toBe(429);
  });

  it('replaces an expired offer instead of leaving the email locked', async () => {
    await env.DB.prepare(
      `INSERT INTO marketing_offer_leads (
         id, email, status, stripe_promotion_code_id, promotion_code, expires_at
       ) VALUES (?, ?, 'ready', ?, ?, ?)`
    )
      .bind(
        'expired-lead',
        'developer@example.com',
        'promo_expired',
        'OMG20-EXPIRED1',
        '2020-01-01T00:00:00.000Z'
      )
      .run();

    const response = await handleMarketingOffer(
      offerRequest('developer@example.com'),
      offerEnv(),
      async (_input, init) => {
        const body = new URLSearchParams(String(init?.body));
        return Response.json({ id: 'promo_replacement', code: body.get('code'), active: true });
      }
    );
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      `SELECT id, status, stripe_promotion_code_id FROM marketing_offer_leads WHERE email = ?`
    )
      .bind('developer@example.com')
      .first();
    expect(row).toMatchObject({ status: 'ready', stripe_promotion_code_id: 'promo_replacement' });
    expect(row?.id).not.toBe('expired-lead');
  });

  it('binds an issued code to the same account before applying it at checkout', async () => {
    const customerId = 'offer-checkout-customer';
    const token = 'offer-checkout-session-token';
    await env.DB.prepare(`INSERT OR REPLACE INTO customers (id, email, tier) VALUES (?, ?, 'free')`)
      .bind(customerId, 'developer@example.com')
      .run();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO sessions (id, customer_id, token, expires_at)
       VALUES (?, ?, ?, datetime('now', '+1 hour'))`
    )
      .bind('offer-checkout-session', customerId, token)
      .run();
    await env.DB.prepare(
      `INSERT INTO marketing_offer_leads (
         id, email, status, stripe_promotion_code_id, promotion_code, expires_at
       ) VALUES (?, ?, 'ready', ?, ?, datetime('now', '+1 day'))`
    )
      .bind('checkout-offer-lead', 'developer@example.com', 'promo_bound_offer', 'OMG20-ABCD2345')
      .run();

    const checkoutEnv = offerEnv();
    checkoutEnv.STRIPE_PRO_PRICE_ID = 'price_pro_test';
    checkoutEnv.STRIPE_TEAM_PRICE_ID = 'price_team_test';
    const stripeFetch = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('discounts[0][promotion_code]')).toBe('promo_bound_offer');
      expect(body.has('allow_promotion_codes')).toBe(false);
      return Response.json({
        id: 'cs_offer_test',
        url: 'https://checkout.stripe.com/c/pay/cs_offer_test',
      });
    });
    const response = await handleCreateCheckout(
      new Request('https://omg-saas.internal/api/billing/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offer: 'pro', promotionCode: 'OMG20-ABCD2345' }),
      }),
      checkoutEnv,
      stripeFetch
    );
    expect(response.status).toBe(200);
    expect(stripeFetch).toHaveBeenCalledOnce();

    await env.DB.prepare(`INSERT OR REPLACE INTO customers (id, email, tier) VALUES (?, ?, 'free')`)
      .bind('other-offer-customer', 'other@example.com')
      .run();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO sessions (id, customer_id, token, expires_at)
       VALUES (?, ?, ?, datetime('now', '+1 hour'))`
    )
      .bind('other-offer-session', 'other-offer-customer', 'other-offer-token')
      .run();
    const rejected = await handleCreateCheckout(
      new Request('https://omg-saas.internal/api/billing/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer other-offer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offer: 'pro', promotionCode: 'OMG20-ABCD2345' }),
      }),
      checkoutEnv,
      stripeFetch
    );
    expect(rejected.status).toBe(400);
    expect(stripeFetch).toHaveBeenCalledOnce();
  });

  it('records malformed Stripe responses separately from provider failures', async () => {
    const stripeFetch = vi.fn<typeof fetch>(async () => Response.json({ id: 42, active: true }));

    const response = await handleMarketingOffer(
      offerRequest('developer@example.com'),
      offerEnv(),
      stripeFetch
    );

    expect(response.status).toBe(502);
    const failedRow = await env.DB.prepare(
      `SELECT status, last_error FROM marketing_offer_leads WHERE email = ?`
    )
      .bind('developer@example.com')
      .first();
    expect(failedRow).toMatchObject({
      status: 'failed',
      last_error: 'stripe response invalid',
    });
  });

  it('retries provider failures with the same code and idempotency key', async () => {
    const attemptedCodes: Array<string | null> = [];
    const idempotencyKeys: Array<string | null> = [];
    let attempt = 0;
    const stripeFetch = vi.fn<typeof fetch>(async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      attemptedCodes.push(body.get('code'));
      idempotencyKeys.push(new Headers(init?.headers).get('Idempotency-Key'));
      attempt += 1;
      return attempt === 1
        ? Response.json({ error: { message: 'permission denied' } }, { status: 403 })
        : Response.json({ id: 'promo_retry', code: body.get('code'), active: true });
    });

    const failed = await handleMarketingOffer(
      offerRequest('developer@example.com'),
      offerEnv(),
      stripeFetch
    );
    expect(failed.status).toBe(502);
    const failedRow = await env.DB.prepare(
      `SELECT status, last_error FROM marketing_offer_leads WHERE email = ?`
    )
      .bind('developer@example.com')
      .first();
    expect(failedRow).toMatchObject({ status: 'failed', last_error: 'stripe unavailable' });

    const retried = await handleMarketingOffer(
      offerRequest('developer@example.com'),
      offerEnv(),
      stripeFetch
    );
    expect(retried.status).toBe(200);
    expect(attemptedCodes[0]).toBe(attemptedCodes[1]);
    expect(idempotencyKeys[0]).toBe(idempotencyKeys[1]);
  });
});
