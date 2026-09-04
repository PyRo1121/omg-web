import { describe, expect, it } from 'vitest';
import type { LicensingSummaryEnvironment } from './licensing-service.server';
import { claimMarketingOfferAction } from './marketing-offer-action.server';
import { failClosedDatabase } from '../../../tests/test-utils';

class OfferServiceStub {
  readonly requests: Array<Request> = [];

  constructor(private readonly response: () => Response) {}

  fetch(request: Request): Promise<Response> {
    this.requests.push(request);
    return Promise.resolve(this.response());
  }
}

function environment(service: OfferServiceStub): LicensingSummaryEnvironment {
  return {
    DB: failClosedDatabase(),
    LICENSING_API: service,
    SVELTE_BFF_SECRET: 'private-bff-secret',
  };
}

function eventFor(
  service: OfferServiceStub,
  email: string,
  getClientAddress: () => string = () => '192.0.2.10'
) {
  return {
    getClientAddress,
    platform: { env: environment(service) },
    request: new Request('https://shadow.example/?/claimOffer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email }),
    }),
  };
}

describe('marketing offer action', () => {
  it('returns a browser-safe offer result', async () => {
    const service = new OfferServiceStub(() =>
      Response.json({
        code: 'OMG20-ABCD2345',
        percentOff: 20,
        durationMonths: 3,
        expiresAt: '2026-09-27T00:00:00.000Z',
      })
    );

    const result = await claimMarketingOfferAction(eventFor(service, ' Developer@Example.com '));

    expect(result).toEqual({
      kind: 'offer',
      offer: {
        code: 'OMG20-ABCD2345',
        percentOff: 20,
        durationMonths: 3,
        expiresAt: '2026-09-27T00:00:00.000Z',
      },
    });
    expect(service.requests).toHaveLength(1);
  });

  it('rejects malformed or oversized forms before invoking the Worker', async () => {
    const service = new OfferServiceStub(() => {
      throw new Error('Worker must not be called');
    });

    const malformed = await claimMarketingOfferAction(eventFor(service, 'not-an-email'));
    const oversized = await claimMarketingOfferAction(eventFor(service, 'a'.repeat(4097)));

    expect(malformed).toMatchObject({
      status: 400,
      data: { kind: 'offer-error', message: 'Enter a valid email address.' },
    });
    expect(oversized).toMatchObject({
      status: 413,
      data: { kind: 'offer-error', message: 'Offer request is too large.' },
    });
    expect(service.requests).toHaveLength(0);
  });

  it('maps rate limiting and unavailable client address to explicit failures', async () => {
    const limitedService = new OfferServiceStub(() =>
      Response.json({ error: 'Too many offer requests' }, { status: 429 })
    );
    const unavailableService = new OfferServiceStub(() => {
      throw new Error('Worker must not be called');
    });

    const limited = await claimMarketingOfferAction(
      eventFor(limitedService, 'developer@example.com')
    );
    const unavailable = await claimMarketingOfferAction(
      eventFor(unavailableService, 'developer@example.com', () => {
        throw new Error('client address unavailable');
      })
    );

    expect(limited).toMatchObject({
      status: 429,
      data: { kind: 'offer-error', message: 'Too many offer requests. Try again later.' },
    });
    expect(unavailable).toMatchObject({
      status: 503,
      data: { kind: 'offer-error', message: 'Offer service unavailable.' },
    });
    expect(unavailableService.requests).toHaveLength(0);
  });
});
