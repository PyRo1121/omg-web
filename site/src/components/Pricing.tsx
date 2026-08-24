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
    description: 'The complete package and runtime manager.',
    features: 'Packages · runtimes · project manifests',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9',
    cadence: 'monthly',
    description: 'Security and visibility for an individual developer.',
    features: 'SBOM · vulnerability scan · secret detection',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$200',
    cadence: 'monthly',
    description: 'Shared policy and auditability for up to 10 people.',
    features: 'Environment sync · audit log · team controls',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'annual terms',
    description: 'Identity, policy, and provenance for larger organizations.',
    features: 'SSO · policy enforcement · provenance',
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
    <section id="pricing" class="manifest-shell py-28 sm:py-36" aria-labelledby="pricing-title">
      <header class="max-w-3xl">
        <h2
          id="pricing-title"
          class="text-5xl leading-[0.94] font-medium tracking-[-0.055em] sm:text-7xl"
        >
          Start free. Add control when it matters.
        </h2>
        <p class="mt-7 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)]">
          Package and runtime management stays free. Paid plans add security, coordination, and
          policy.
        </p>
      </header>

      <aside class="mt-20 grid gap-6 border-y border-[var(--rule-strong)] py-8 sm:grid-cols-[1fr_auto] sm:items-center sm:py-10">
        <p class="m-0 max-w-2xl text-2xl leading-tight font-medium tracking-[-0.035em] sm:text-3xl">
          Considering Pro or Team? Take 20% off the first three months.
        </p>
        <button type="button" class="manifest-button" onClick={() => setShowOffer(true)}>
          Get a private code
        </button>
      </aside>

      <ol class="m-0 list-none p-0">
        <For each={PLANS}>
          {plan => (
            <li class="grid gap-5 border-b border-[var(--rule)] py-8 sm:grid-cols-[0.55fr_0.7fr_1.35fr_auto] sm:items-center sm:py-10">
              <header>
                <h3 class="text-2xl font-medium tracking-[-0.035em]">{plan.name}</h3>
                <p class="m-0 mt-1 font-mono text-[10px] text-[var(--ink-muted)]">{plan.cadence}</p>
              </header>
              <p
                class={`m-0 text-4xl font-medium tracking-[-0.05em] ${plan.id === 'pro' ? 'text-[var(--signal)]' : ''}`}
              >
                {plan.price}
              </p>
              <span>
                <p class="m-0 max-w-md text-sm text-[var(--ink-muted)]">{plan.description}</p>
                <p class="m-0 mt-2 font-mono text-[10px] text-[#69736b]">{plan.features}</p>
              </span>
              <Show
                when={plan.id === 'pro' || plan.id === 'team'}
                fallback={
                  plan.id === 'free' ? (
                    <a href="#install" class="manifest-button">
                      Install free
                    </a>
                  ) : (
                    <a href="mailto:enterprise@latham.cloud" class="manifest-button">
                      Contact sales
                    </a>
                  )
                }
              >
                <button
                  type="button"
                  class={
                    plan.id === 'pro'
                      ? 'manifest-button manifest-button--primary'
                      : 'manifest-button'
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
