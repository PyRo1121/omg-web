import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  createBillingCheckout,
  createBillingPortal,
  loadBillingFulfillment,
} from './billing-service.server';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import { siteSessionResponse } from '../../../tests/test-utils';

const identity = {
  id: 'better-auth-user-1',
  email: 'ada@example.com',
  name: 'Ada',
  emailVerified: true,
};

class BillingServiceStub {
  readonly requests: Array<Request> = [];

  constructor(private readonly response: (request: Request) => Response) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push(request.clone());
    if (new URL(request.url).pathname === '/api/internal/site-session') {
      return siteSessionResponse({ customerId: 'customer-1' });
    }
    return this.response(request);
  }
}

function environment(service: BillingServiceStub): LicensingSummaryEnvironment {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ role: 'user' }) }),
      }),
    },
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

describe('Svelte billing service', () => {
  it('opens the signed-in customer portal through an authenticated private session', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({ success: true, url: 'https://billing.stripe.com/p/session/safe' })
    );

    const result = await Effect.runPromise(createBillingPortal(identity, environment(service)));

    expect(result).toEqual({ url: 'https://billing.stripe.com/p/session/safe' });
    expect(service.requests).toHaveLength(2);
    const portalRequest = service.requests[1];
    expect(portalRequest?.method).toBe('POST');
    expect(portalRequest?.headers.get('Authorization')).toBe('Bearer server-only-token');
    expect(await portalRequest?.json()).toEqual({});
  });

  it('rejects untrusted billing portal redirects at the private response boundary', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({ success: true, url: 'https://attacker.example/portal' })
    );

    const exit = await Effect.runPromiseExit(createBillingPortal(identity, environment(service)));

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects a billing portal redirect on a non-default HTTPS port', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({ success: true, url: 'https://billing.stripe.com:8443/p/session' })
    );

    const exit = await Effect.runPromiseExit(createBillingPortal(identity, environment(service)));

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('creates checkout through an authenticated private session', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({
        sessionId: 'cs_live_1234567890ABCDE',
        url: 'https://checkout.stripe.com/c/pay/cs_live_1234567890ABCDE',
      })
    );

    const result = await Effect.runPromise(
      createBillingCheckout(identity, environment(service), {
        offer: 'team',
        promotionCode: 'OMG20-ABCD2345',
      })
    );

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_live_1234567890ABCDE',
    });
    expect(service.requests).toHaveLength(2);
    const checkoutRequest = service.requests[1];
    expect(checkoutRequest?.method).toBe('POST');
    expect(checkoutRequest?.headers.get('Authorization')).toBe('Bearer server-only-token');
    expect(await checkoutRequest?.json()).toEqual({
      offer: 'team',
      promotionCode: 'OMG20-ABCD2345',
    });
  });

  it('rejects untrusted Stripe redirects at the private response boundary', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({
        sessionId: 'cs_test_1234567890ABCDE',
        url: 'https://attacker.example/checkout',
      })
    );

    const exit = await Effect.runPromiseExit(
      createBillingCheckout(identity, environment(service), { offer: 'pro' })
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects a checkout redirect on a non-default HTTPS port', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({
        sessionId: 'cs_test_1234567890ABCDE',
        url: 'https://checkout.stripe.com:8443/c/pay/cs_test_1234567890ABCDE',
      })
    );

    const exit = await Effect.runPromiseExit(
      createBillingCheckout(identity, environment(service), { offer: 'pro' })
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('projects paid fulfillment without exposing the license key or email', async () => {
    const service = new BillingServiceStub(() =>
      Response.json({
        status: 'paid',
        email: 'ada@example.com',
        license: { license_key: 'OMG-LICENSE-PRIVATE', tier: 'pro' },
      })
    );

    const result = await Effect.runPromise(
      loadBillingFulfillment(identity, environment(service), 'cs_test_1234567890ABCDE')
    );

    expect(result).toEqual({ kind: 'ready', tier: 'pro' });
    expect(JSON.stringify(result)).not.toContain('LICENSE');
    expect(JSON.stringify(result)).not.toContain('ada@example.com');
    expect(service.requests[1]?.url).toBe(
      'https://omg-saas.internal/api/billing/checkout-session?id=cs_test_1234567890ABCDE'
    );
  });

  it('classifies eventual and unverified fulfillment without leaking provider data', async () => {
    const processing = new BillingServiceStub(() =>
      Response.json({ status: 'paid', license: null })
    );
    const unverified = new BillingServiceStub(() => Response.json({ status: 'unpaid' }));

    await expect(
      Effect.runPromise(
        loadBillingFulfillment(identity, environment(processing), 'cs_test_1234567890ABCDE')
      )
    ).resolves.toEqual({ kind: 'processing' });
    await expect(
      Effect.runPromise(
        loadBillingFulfillment(identity, environment(unverified), 'cs_test_1234567890ABCDE')
      )
    ).resolves.toEqual({ kind: 'unverified' });
  });

  it('rejects malformed session ids before service access', async () => {
    const service = new BillingServiceStub(() => Response.json({ status: 'paid' }));

    const exit = await Effect.runPromiseExit(
      loadBillingFulfillment(identity, environment(service), 'not-a-session')
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(service.requests).toHaveLength(0);
  });
});
