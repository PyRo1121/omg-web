import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import CheckoutStatus from './CheckoutStatus.svelte';

describe('checkout fulfillment status', () => {
  it('renders only a browser-safe ready projection', () => {
    const result = render(CheckoutStatus, {
      props: { fulfillment: { kind: 'ready', tier: 'pro' } },
    });

    expect(result.body).toContain('Your pro entitlement is ready.');
    expect(result.body).toContain('href="/dashboard/"');
    expect(result.body).not.toContain('license');
    expect(result.body).not.toContain('session_id');
    expect(result.body).not.toContain('stripe');
  });

  it('renders eventual and unverified states without private values', () => {
    const processing = render(CheckoutStatus, {
      props: { fulfillment: { kind: 'processing' } },
    });
    const unverified = render(CheckoutStatus, {
      props: { fulfillment: { kind: 'unverified' } },
    });

    expect(processing.body).toContain('Fulfillment is processing.');
    expect(unverified.body).toContain('could not verify this checkout');
    expect(`${processing.body}${unverified.body}`).not.toContain('cs_');
  });
});
