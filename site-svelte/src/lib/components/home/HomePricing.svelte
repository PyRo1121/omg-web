<script lang="ts">
  import {
    MARKETING_OFFER_DURATION_MONTHS,
    MARKETING_OFFER_PERCENT_OFF,
    PRO_MONTHLY_PRICE_LABEL,
    TEAM_MONTHLY_PRICE_LABEL,
  } from '../../contracts/marketing-offer';
  import { MAX_LOGIN_EMAIL_CHARACTERS } from '../../../../../shared/login-credentials';
  import type { MarketingOffer } from '../../contracts/marketing-offer';

  let {
    offer = null,
    offerError = null,
    checkoutError = null,
    checkoutRecovery = null,
    promotionCode = null,
  }: {
    offer?: MarketingOffer | null;
    offerError?: string | null;
    checkoutError?: string | null;
    checkoutRecovery?: 'sign-in' | null;
    promotionCode?: string | null;
  } = $props();

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      cadence: 'forever',
      description: 'Packages, runtimes, and reproducible project environments.',
      href: '#install',
      action: 'Install OMG',
      primary: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: PRO_MONTHLY_PRICE_LABEL,
      cadence: 'per month',
      description: 'Add SBOMs, vulnerability scanning, and secret detection.',
      href: '/signup/',
      action: 'Choose Pro',
      primary: true,
    },
    {
      id: 'team',
      name: 'Team',
      price: TEAM_MONTHLY_PRICE_LABEL,
      cadence: 'per month',
      description: 'Environment sync, audit history, and controls for up to 10 people.',
      href: '/signup/',
      action: 'Choose Team',
      primary: false,
    },
  ] as const;
</script>

<section
  id="pricing"
  class="pricing home-shell home-section home-split"
  aria-labelledby="pricing-title"
>
  <header class="pricing-copy">
    <h2 id="pricing-title" class="home-section-title">The core stays free.</h2>
    <p class="home-section-intro">Pay when you need security, shared policy, or team visibility.</p>
  </header>

  <div class="pricing-content">
    <div class="offer-panel">
      <div>
        <p class="offer-kicker">Introductory offer</p>
        <h3>
          Take {MARKETING_OFFER_PERCENT_OFF}% off your first {MARKETING_OFFER_DURATION_MONTHS} months.
        </h3>
        <p>Claim one email-bound code, then continue to Stripe with the same signed-in account.</p>
      </div>
      <form method="POST" action="?/claimOffer" class="offer-form">
        <label for="offer-email">Account email</label>
        <div>
          <input
            id="offer-email"
            name="email"
            type="email"
            autocomplete="email"
            maxlength={MAX_LOGIN_EMAIL_CHARACTERS}
            required
            placeholder="developer@example.com"
          />
          <button type="submit">Create offer</button>
        </div>
      </form>
      {#if offer !== null}
        <p class="offer-result" aria-live="polite">
          <span>Your code</span>
          <code>{offer.code}</code>
          <small>{offer.percentOff}% off for {offer.durationMonths} months</small>
        </p>
      {:else if offerError !== null}
        <p class="offer-error" role="alert">{offerError}</p>
      {/if}
    </div>
    {#if checkoutError !== null}
      <p class="checkout-error" role="alert">
        {checkoutError}
        {#if checkoutRecovery === 'sign-in'}
          <a href="/login/">Sign in</a>
        {/if}
      </p>
    {/if}
    <ol class="plan-list">
      {#each plans as plan (plan.id)}
        <li>
          <header>
            <h3>{plan.name}</h3>
            <span>{plan.cadence}</span>
          </header>
          <p class="plan-price">{plan.price}</p>
          <p>{plan.description}</p>
          {#if plan.id === 'free'}
            <a class="plan-link" href={plan.href}>{plan.action}</a>
          {:else}
            <form method="POST" action="?/startCheckout" class="checkout-form">
              <input type="hidden" name="offer" value={plan.id} />
              {#if promotionCode !== null}
                <input type="hidden" name="promotionCode" value={promotionCode} />
              {/if}
              <button
                type="submit"
                class={plan.primary ? 'plan-link plan-link-primary' : 'plan-link'}
              >
                {plan.action}
              </button>
            </form>
          {/if}
        </li>
      {/each}
    </ol>
    <p class="enterprise-note">
      Need SSO, policy enforcement, or provenance?
      <a href="mailto:enterprise@latham.cloud">Talk to us about Enterprise.</a>
    </p>
  </div>
</section>

<style>
  .pricing-content {
    min-width: 0;
  }

  .offer-panel {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1.25rem, 3vw, 2rem);
    border: 1px solid var(--rule-strong);
    background: var(--paper-raised);
  }

  .offer-kicker,
  .offer-form label,
  .offer-result span,
  .offer-result small {
    font-family: var(--font-mono);
    text-transform: uppercase;
  }

  .offer-kicker {
    color: var(--signal);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
  }

  .offer-panel h3 {
    margin-top: 0.6rem;
    font-size: clamp(1.5rem, 3vw, 2.25rem);
    letter-spacing: -0.045em;
  }

  .offer-panel > div > p:last-child {
    max-width: 42rem;
    margin-top: 0.75rem;
    color: var(--ink-muted);
    font-size: 0.9rem;
    line-height: 1.65;
  }

  .offer-form {
    display: grid;
    gap: 0.55rem;
  }

  .offer-form label {
    color: var(--ink-muted);
    font-size: 0.65rem;
  }

  .offer-form > div {
    display: grid;
  }

  .offer-form input,
  .offer-form button {
    min-height: 3rem;
    border: 1px solid var(--rule-strong);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .offer-form input {
    min-width: 0;
    padding-inline: 0.9rem;
    background: var(--paper);
    color: var(--ink);
  }

  .offer-form input:focus {
    border-color: var(--signal);
    outline: none;
  }

  .offer-form button {
    padding-inline: 1rem;
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
  }

  .offer-form button:hover {
    background: var(--signal);
    color: var(--signal-ink);
  }

  .offer-result {
    display: grid;
    gap: 0.35rem;
    padding-left: 1rem;
    border-left: 2px solid var(--signal);
  }

  .offer-result span,
  .offer-result small {
    color: var(--ink-muted);
    font-size: 0.62rem;
  }

  .offer-result code {
    font-size: 1.2rem;
  }

  .offer-error,
  .checkout-error {
    color: var(--danger);
    font-size: 0.85rem;
  }

  .checkout-error {
    margin-top: 1rem;
  }

  .checkout-error a {
    margin-left: 0.5rem;
    color: var(--ink);
    text-underline-offset: 0.25rem;
  }

  .plan-list {
    margin: clamp(2.5rem, 6vw, 5rem) 0 0;
    padding: 0;
    border-top: 1px solid var(--rule);
    list-style: none;
  }

  .plan-list > li {
    display: grid;
    gap: 1.5rem;
    align-items: center;
    padding-block: 2rem;
    border-bottom: 1px solid var(--rule);
  }

  .plan-list h3 {
    font-size: 1.6rem;
    font-weight: 650;
    letter-spacing: -0.045em;
  }

  .plan-list header span {
    display: block;
    margin-top: 0.2rem;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .plan-list > li > p:not(.plan-price),
  .enterprise-note {
    color: var(--ink-muted);
    line-height: 1.65;
  }

  .plan-price {
    font-size: 2.5rem;
    font-weight: 650;
    letter-spacing: -0.06em;
    line-height: 1;
  }

  .checkout-form {
    justify-self: start;
  }

  .plan-link {
    display: inline-flex;
    min-height: 3rem;
    align-items: center;
    justify-content: center;
    justify-self: start;
    padding-inline: 1.25rem;
    border: 1px solid var(--rule-strong);
    background: transparent;
    color: var(--ink);
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }

  .plan-link:hover {
    border-color: var(--signal);
  }

  .plan-link-primary {
    border-color: var(--signal);
    background: var(--signal);
    color: var(--signal-ink);
  }

  .plan-link-primary:hover {
    background: var(--signal-hover);
  }

  .enterprise-note {
    margin-top: 1.25rem;
    font-size: 0.85rem;
  }

  .enterprise-note a {
    color: var(--ink);
    text-decoration-color: var(--signal);
    text-underline-offset: 0.3rem;
  }

  @media (min-width: 48rem) {
    .offer-form > div {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .plan-list > li {
      grid-template-columns: 0.5fr 0.45fr 1.35fr auto;
      gap: clamp(1.5rem, 3vw, 3rem);
    }
  }
</style>
