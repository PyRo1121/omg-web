<script lang="ts">
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
      price: '$9',
      cadence: 'per month',
      description: 'Add SBOMs, vulnerability scanning, and secret detection.',
      href: '/signup/',
      action: 'Create account',
      primary: true,
    },
    {
      id: 'team',
      name: 'Team',
      price: '$200',
      cadence: 'per month',
      description: 'Environment sync, audit history, and controls for up to 10 people.',
      href: '/signup/',
      action: 'Create account',
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
    <p class="billing-note">
      Paid checkout is not connected to this migration preview. Account creation remains available.
    </p>
    <ol class="plan-list">
      {#each plans as plan (plan.id)}
        <li>
          <header>
            <h3>{plan.name}</h3>
            <span>{plan.cadence}</span>
          </header>
          <p class="plan-price">{plan.price}</p>
          <p>{plan.description}</p>
          <a class={plan.primary ? 'plan-link plan-link-primary' : 'plan-link'} href={plan.href}>
            {plan.action}
          </a>
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

  .billing-note {
    max-width: 42rem;
    padding: 1.25rem 1.5rem;
    border-left: 2px solid var(--signal);
    background: var(--paper-raised);
    color: var(--ink-muted);
    font-size: 0.9rem;
    line-height: 1.65;
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

  .plan-link {
    display: inline-flex;
    min-height: 3rem;
    align-items: center;
    justify-content: center;
    justify-self: start;
    padding-inline: 1.25rem;
    border: 1px solid var(--rule-strong);
    font-size: 0.82rem;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
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
    .plan-list > li {
      grid-template-columns: 0.5fr 0.45fr 1.35fr auto;
      gap: clamp(1.5rem, 3vw, 3rem);
    }
  }
</style>
