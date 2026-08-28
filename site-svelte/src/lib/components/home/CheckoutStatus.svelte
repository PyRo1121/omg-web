<script lang="ts">
  import type { BillingFulfillment } from '../../contracts/billing';

  let { fulfillment }: { fulfillment: BillingFulfillment } = $props();

  $effect(() => {
    window.history.replaceState(window.history.state, '', '/');
  });
</script>

<section class="checkout-status" aria-labelledby="checkout-status-title">
  <p class="status-kicker">Checkout verification</p>
  {#if fulfillment.kind === 'ready'}
    <h2 id="checkout-status-title">Your {fulfillment.tier} entitlement is ready.</h2>
    <p>Payment and webhook fulfillment are verified. Open your account to continue.</p>
    <a href="/dashboard/">Open dashboard</a>
  {:else if fulfillment.kind === 'processing'}
    <h2 id="checkout-status-title">Payment received. Fulfillment is processing.</h2>
    <p>The signed Stripe webhook is still being reconciled. Check your dashboard shortly.</p>
    <a href="/dashboard/">Open dashboard</a>
  {:else}
    <h2 id="checkout-status-title">We could not verify this checkout.</h2>
    <p>Sign in with the account used at checkout, then open your dashboard for current status.</p>
    <a href="/login/">Sign in</a>
  {/if}
</section>

<style>
  .checkout-status {
    display: grid;
    gap: 0.8rem;
    max-width: 88rem;
    margin-inline: auto;
    padding: clamp(1.25rem, 3vw, 2rem) clamp(1rem, 3vw, 2.5rem);
    border-bottom: 1px solid var(--rule);
    background: var(--paper-raised);
  }

  .status-kicker {
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    max-width: 28ch;
    font-size: clamp(1.5rem, 3vw, 2.4rem);
    letter-spacing: -0.045em;
  }

  .checkout-status > p:not(.status-kicker) {
    max-width: 44rem;
    color: var(--ink-muted);
    line-height: 1.65;
  }

  a {
    justify-self: start;
    padding-block: 0.35rem;
    color: var(--ink);
    font-weight: 650;
    text-decoration-color: var(--signal);
    text-underline-offset: 0.3rem;
  }
</style>
