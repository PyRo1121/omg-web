import type { Component } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';
import type { MarketingPromotionCode } from '../../../shared/marketing-offer';
import MarketingOfferDialog from './MarketingOfferDialog';
import UpgradeModal from './UpgradeModal';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    description: 'Packages, runtimes, and reproducible project environments.',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9',
    cadence: 'per month',
    description: 'Add SBOMs, vulnerability scanning, and secret detection.',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$200',
    cadence: 'per month',
    description: 'Environment sync, audit history, and controls for up to 10 people.',
  },
] as const;

const Pricing: Component = () => {
  const [showUpgradeModal, setShowUpgradeModal] = createSignal(false);
  const [showOffer, setShowOffer] = createSignal(false);
  const [promotionCode, setPromotionCode] = createSignal<MarketingPromotionCode>();
  const [initialTier, setInitialTier] = createSignal<'pro' | 'team'>('pro');
  let offerTrigger: HTMLButtonElement | undefined;
  let upgradeTrigger: HTMLButtonElement | undefined;

  const openUpgrade = (
    tier: 'pro' | 'team',
    returnFocusTarget: HTMLButtonElement | undefined
  ): void => {
    upgradeTrigger = returnFocusTarget;
    setInitialTier(tier);
    setShowUpgradeModal(true);
  };

  return (
    <section
      id="pricing"
      class="manifest-shell border-t border-[var(--rule)] py-24 sm:py-32"
      aria-labelledby="pricing-title"
    >
      <header class="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <h2
            id="pricing-title"
            class="max-w-[8ch] text-5xl leading-[0.9] font-semibold tracking-[-0.065em] sm:text-7xl"
          >
            The core stays free.
          </h2>
          <p class="mt-7 max-w-sm leading-relaxed text-[var(--ink-muted)]">
            Pay when you need security, shared policy, or team visibility.
          </p>
        </div>

        <aside class="self-end border-l-2 border-[var(--signal)] pl-5 lg:justify-self-end">
          <p class="m-0 max-w-lg text-2xl leading-tight font-medium tracking-[-0.035em]">
            Pro and Team are 20% off for the first three months.
          </p>
          <button
            type="button"
            class="mt-4 min-h-6 py-1 text-left text-sm font-medium text-[var(--signal)] underline decoration-[var(--rule)] underline-offset-4 hover:decoration-[var(--signal)]"
            onClick={event => {
              offerTrigger = event.currentTarget;
              setShowOffer(true);
            }}
          >
            Get a private code
          </button>
        </aside>
      </header>

      <ol class="mt-20 list-none border-t border-[var(--rule)] p-0 sm:mt-24">
        <For each={PLANS}>
          {plan => (
            <li class="grid gap-6 border-b border-[var(--rule)] py-8 sm:grid-cols-[0.5fr_0.55fr_1.35fr_auto] sm:items-center lg:py-10">
              <header>
                <h3 class="text-2xl font-semibold tracking-[-0.04em]">{plan.name}</h3>
                <span class="mt-1 block text-xs text-[var(--ink-muted)]">{plan.cadence}</span>
              </header>
              <p class="m-0 text-4xl leading-none font-semibold tracking-[-0.06em] text-[var(--ink)]">
                {plan.price}
              </p>
              <p class="m-0 max-w-lg leading-relaxed text-[var(--ink-muted)]">{plan.description}</p>
              <Show
                when={plan.id === 'pro' || plan.id === 'team'}
                fallback={
                  <a href="#install" class="manifest-button justify-self-start">
                    Install free
                  </a>
                }
              >
                <button
                  type="button"
                  class={
                    plan.id === 'pro'
                      ? 'manifest-button manifest-button--primary justify-self-start'
                      : 'manifest-button justify-self-start'
                  }
                  onClick={event =>
                    openUpgrade(plan.id === 'team' ? 'team' : 'pro', event.currentTarget)
                  }
                >
                  Choose {plan.name}
                </button>
              </Show>
            </li>
          )}
        </For>
      </ol>

      <p class="m-0 pt-5 text-sm text-[var(--ink-muted)]">
        Need SSO, policy enforcement, or provenance?{' '}
        <a
          href="mailto:enterprise@latham.cloud"
          class="text-[var(--ink)] underline underline-offset-4"
        >
          Talk to us about Enterprise.
        </a>
      </p>

      <MarketingOfferDialog
        open={showOffer()}
        onOpenChange={setShowOffer}
        onOfferCreated={offer => setPromotionCode(offer.code)}
        onChoosePro={() => openUpgrade('pro', offerTrigger)}
        restoreFocus={() => offerTrigger?.focus()}
      />

      <UpgradeModal
        isOpen={showUpgradeModal()}
        onClose={() => setShowUpgradeModal(false)}
        initialTier={initialTier()}
        promotionCode={promotionCode()}
        restoreFocus={() => upgradeTrigger?.focus()}
      />
    </section>
  );
};

export default Pricing;
