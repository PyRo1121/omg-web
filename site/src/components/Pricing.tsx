import type { Component } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';
import type { MarketingPromotionCode } from '../../shared/marketing-offer';
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

  const openUpgrade = (tier: 'pro' | 'team'): void => {
    setInitialTier(tier);
    setShowUpgradeModal(true);
  };

  return (
    <section
      id="pricing"
      class="manifest-shell border-x border-t border-[var(--rule)]"
      aria-labelledby="pricing-title"
    >
      <header class="grid gap-10 border-b border-[var(--rule-strong)] px-5 py-20 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-12 lg:py-28">
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
            class="mt-6 font-mono text-[11px] text-[var(--signal)] underline decoration-[var(--rule-strong)] underline-offset-6 hover:decoration-[var(--signal)]"
            onClick={() => setShowOffer(true)}
          >
            Get a private code →
          </button>
        </aside>
      </header>

      <ol class="m-0 list-none p-0">
        <For each={PLANS}>
          {plan => (
            <li class="grid gap-6 border-b border-[var(--rule)] px-5 py-8 sm:grid-cols-[0.5fr_0.55fr_1.35fr_auto] sm:items-center sm:px-8 lg:px-12 lg:py-10">
              <header>
                <h3 class="text-2xl font-semibold tracking-[-0.04em]">{plan.name}</h3>
                <span class="mt-1 block font-mono text-[10px] text-[var(--ink-muted)]">
                  {plan.cadence}
                </span>
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
                  onClick={() => openUpgrade(plan.id === 'team' ? 'team' : 'pro')}
                >
                  Choose {plan.name}
                </button>
              </Show>
            </li>
          )}
        </For>
      </ol>

      <p class="m-0 border-t border-[var(--rule)] px-5 py-5 text-sm text-[var(--ink-muted)] sm:px-8 lg:px-12">
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
        onChoosePro={() => openUpgrade('pro')}
      />

      <Show when={showUpgradeModal()}>
        <UpgradeModal
          isOpen={showUpgradeModal()}
          onClose={() => setShowUpgradeModal(false)}
          initialTier={initialTier()}
          promotionCode={promotionCode()}
        />
      </Show>
    </section>
  );
};

export default Pricing;
