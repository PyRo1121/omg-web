import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { openBillingPortalAction, startBillingCheckoutAction } from './billing-action.server';
import {
  LicensingSummaryInvalidPayload,
  LicensingSummaryWorkerRejected,
} from './licensing-service.server';

const identity = {
  sessionToken: 'browser-session-token',
  user: {
    id: 'better-auth-user-1',
    email: 'ada@example.com',
    name: 'Ada',
    emailVerified: true,
    image: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
};

const env = {
  BETTER_AUTH_SECRET: 'test-auth-secret-test-auth-secret',
  GITHUB_CLIENT_ID: 'github-client',
  GITHUB_CLIENT_SECRET: 'github-secret',
  DB: {
    prepare: () => ({ bind: () => ({ first: async () => ({ role: 'user' }) }) }),
  },
  LICENSING_API: { fetch: async () => Response.json({}) },
  SVELTE_BFF_SECRET: 'private-bff-secret',
};

function request(body: string, headers: HeadersInit = {}): Request {
  return new Request('https://shadow.example/?/startCheckout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

function event(input: Request) {
  return { platform: { env }, request: input, url: new URL(input.url) };
}

describe('billing portal action', () => {
  it('redirects an authenticated account only to the validated Stripe Billing origin', async () => {
    await expect(
      openBillingPortalAction(event(request('')), {
        loadIdentity: async () => identity,
        createPortal: (user, actionEnv) => {
          expect(user).toEqual(identity.user);
          expect(actionEnv).toBe(env);
          return Effect.succeed({ url: 'https://billing.stripe.com/p/session/safe' });
        },
      })
    ).rejects.toMatchObject({
      status: 303,
      location: 'https://billing.stripe.com/p/session/safe',
    });
  });

  it('fails closed for anonymous and missing billing accounts', async () => {
    const anonymous = await openBillingPortalAction(event(request('')), {
      loadIdentity: async () => null,
      createPortal: () => Effect.succeed({ url: 'https://billing.stripe.com/p/session/safe' }),
    });
    const missing = await openBillingPortalAction(event(request('')), {
      loadIdentity: async () => identity,
      createPortal: () => Effect.fail(new LicensingSummaryWorkerRejected('billing-portal', 404)),
    });

    expect(anonymous.status).toBe(401);
    expect(anonymous.data.message).toBe('Sign in before opening billing settings.');
    expect(missing.status).toBe(404);
    expect(missing.data.message).toBe('No billing account is linked to this account.');
  });

  it('classifies rate limits and malformed private responses', async () => {
    const limited = await openBillingPortalAction(event(request('')), {
      loadIdentity: async () => identity,
      createPortal: () => Effect.fail(new LicensingSummaryWorkerRejected('billing-portal', 429)),
    });
    const malformed = await openBillingPortalAction(event(request('')), {
      loadIdentity: async () => identity,
      createPortal: () => Effect.fail(new LicensingSummaryInvalidPayload('billing-portal')),
    });

    expect(limited.status).toBe(429);
    expect(limited.data.message).toBe('Too many billing requests. Try again later.');
    expect(malformed.status).toBe(503);
    expect(JSON.stringify(malformed.data)).not.toContain('LicensingSummary');
  });

  it('bounds the portal form before identity or billing work', async () => {
    let identityCalled = false;
    const oversized = request(`padding=${'x'.repeat(5000)}`);

    const result = await openBillingPortalAction(event(oversized), {
      loadIdentity: async () => {
        identityCalled = true;
        return identity;
      },
      createPortal: () => Effect.succeed({ url: 'https://billing.stripe.com/p/session/safe' }),
    });

    expect(result.status).toBe(413);
    expect(identityCalled).toBe(false);
  });
});

describe('billing checkout action', () => {
  it('passes the authenticated identity and selected offer to billing', async () => {
    let received: object | null = null;

    await expect(
      startBillingCheckoutAction(event(request('offer=team&promotionCode=OMG20-ABCD2345')), {
        loadIdentity: async () => identity,
        createCheckout: (user, actionEnv, input) => {
          received = { user, actionEnv, input };
          return Effect.succeed({ url: 'https://checkout.stripe.com/c/pay/cs_safe' });
        },
      })
    ).rejects.toMatchObject({ status: 303, location: 'https://checkout.stripe.com/c/pay/cs_safe' });

    expect(received).toEqual({
      user: identity.user,
      actionEnv: env,
      input: { offer: 'team', promotionCode: 'OMG20-ABCD2345' },
    });
  });

  it('requires authentication before calling billing', async () => {
    let billingCalled = false;

    const result = await startBillingCheckoutAction(event(request('offer=pro')), {
      loadIdentity: async () => null,
      createCheckout: () => {
        billingCalled = true;
        return Effect.succeed({ url: 'https://checkout.stripe.com/c/pay/cs_safe' });
      },
    });

    expect(result.status).toBe(401);
    expect(result.data).toEqual({
      kind: 'checkout-error',
      message: 'Sign in before starting checkout.',
      offer: 'pro',
      promotionCode: null,
    });
    expect(billingCalled).toBe(false);
  });

  it('bounds the body before identity or billing work', async () => {
    let identityCalled = false;
    const oversized = request(`offer=pro&padding=${'x'.repeat(5000)}`);

    const result = await startBillingCheckoutAction(event(oversized), {
      loadIdentity: async () => {
        identityCalled = true;
        return identity;
      },
      createCheckout: () => Effect.succeed({ url: 'https://checkout.stripe.com/' }),
    });

    expect(result.status).toBe(413);
    expect(result.data.message).toBe('Checkout request is too large.');
    expect(identityCalled).toBe(false);
  });

  it('classifies invalid promotions and rate limits without returning internals', async () => {
    const invalid = await startBillingCheckoutAction(
      event(request('offer=pro&promotionCode=OMG20-ABCD2345')),
      {
        loadIdentity: async () => identity,
        createCheckout: () =>
          Effect.fail(new LicensingSummaryWorkerRejected('billing-checkout', 400)),
      }
    );
    const limited = await startBillingCheckoutAction(event(request('offer=team')), {
      loadIdentity: async () => identity,
      createCheckout: () =>
        Effect.fail(new LicensingSummaryWorkerRejected('billing-checkout', 429)),
    });

    expect(invalid.status).toBe(400);
    expect(invalid.data.message).toContain('account that requested it');
    expect(limited.status).toBe(429);
    expect(JSON.stringify(limited.data)).not.toContain('LicensingSummary');
  });
});
