import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import HomePricing from './HomePricing.svelte';

describe('home pricing offer', () => {
  it('renders functional offer and paid checkout forms', () => {
    const result = render(HomePricing, { props: {} });

    expect(result.body).toContain('action="?/claimOffer"');
    expect(result.body).toContain('maxlength="254"');
    expect(result.body.match(/action="\?\/startCheckout"/gu)).toHaveLength(2);
    expect(result.body).toContain('name="offer" value="pro"');
    expect(result.body).toContain('name="offer" value="team"');
    expect(result.body).not.toContain('OMG20-');
  });

  it('renders only the browser-safe offer projection or classified failure', () => {
    const offer = render(HomePricing, {
      props: {
        offer: {
          code: 'OMG20-ABCD2345',
          percentOff: 20,
          durationMonths: 3,
          expiresAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });
    const failure = render(HomePricing, {
      props: { offerError: 'Offer service unavailable.' },
    });

    expect(offer.body).toContain('OMG20-ABCD2345');
    expect(offer.body).toContain('20% off for 3 months');
    expect(offer.body).not.toContain('promo_');
    expect(failure.body).toContain('role="alert"');
    expect(failure.body).toContain('Offer service unavailable.');
  });

  it('carries a public offer code into checkout and renders classified auth failures', () => {
    const result = render(HomePricing, {
      props: {
        promotionCode: 'OMG20-ABCD2345',
        checkoutError: 'Sign in before starting checkout.',
      },
    });

    expect(result.body.match(/name="promotionCode" value="OMG20-ABCD2345"/gu)).toHaveLength(2);
    expect(result.body).toContain('role="alert"');
    expect(result.body).toContain('href="/login/"');
    expect(result.body).not.toContain('license_key');
  });
});
