import type { Component } from 'solid-js';
import { For, createSignal } from 'solid-js';
import UpgradeModal from './UpgradeModal';

interface Feature {
  readonly label: string;
  readonly strong?: true;
}

const FeatureList: Component<{ features: readonly Feature[] }> = props => (
  <ul class="mb-6 space-y-3 text-sm">
    <For each={props.features}>
      {feature => (
        <li class="flex items-center gap-2">
          <span class="text-green-400">✓</span>
          {feature.strong ? <strong>{feature.label}</strong> : feature.label}
        </li>
      )}
    </For>
  </ul>
);

const FREE_FEATURES: readonly Feature[] = [
  { label: 'Package management' },
  { label: '100+ runtimes via mise' },
  { label: 'Container integration' },
  { label: 'Environment fingerprinting' },
  { label: 'Gist sharing' },
];

const PRO_FEATURES: readonly Feature[] = [
  { label: 'Everything in Free' },
  { label: 'SBOM generation', strong: true },
  { label: 'Vulnerability scanning', strong: true },
  { label: 'Secret detection', strong: true },
];

const TEAM_FEATURES: readonly Feature[] = [
  { label: 'Everything in Pro' },
  { label: 'Team environment sync', strong: true },
  { label: 'Shared team configs', strong: true },
  { label: 'Tamper-proof audit logs', strong: true },
  { label: 'Up to 25 team members', strong: true },
];

const ENTERPRISE_FEATURES: readonly Feature[] = [
  { label: 'Everything in Team' },
  { label: 'SSO/SAML integration', strong: true },
  { label: 'Policy enforcement', strong: true },
  { label: 'SLSA provenance', strong: true },
  { label: 'Dedicated support', strong: true },
];

const Pricing: Component = () => {
  const [showUpgradeModal, setShowUpgradeModal] = createSignal(false);
  const [initialTier, setInitialTier] = createSignal<'pro' | 'team'>('pro');

  const openUpgrade = (tier: 'pro' | 'team') => {
    setInitialTier(tier);
    setShowUpgradeModal(true);
  };

  return (
    <section id="pricing" class="px-6 py-24">
      <div class="mx-auto max-w-7xl">
        <div class="mb-16 text-center">
          <h2 class="mb-4 text-4xl font-bold md:text-5xl">Simple, Transparent Pricing</h2>
          <p class="mx-auto max-w-2xl text-xl text-slate-400">
            Start free, upgrade when you need security scanning, team features, or enterprise
            controls.
          </p>
        </div>

        <div class="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Free Tier */}
          <div class="pricing-card">
            <div class="mb-6">
              <h3 class="mb-2 text-2xl font-bold">Free</h3>
              <p class="text-sm text-slate-400">For individual developers</p>
            </div>

            <div class="mb-6">
              <span class="text-4xl font-bold">$0</span>
              <span class="text-sm text-slate-400">/forever</span>
            </div>

            <FeatureList features={FREE_FEATURES} />

            <a href="#install" class="btn-secondary w-full justify-center text-sm">
              Get Started
            </a>
          </div>

          {/* Pro Tier */}
          <div class="pricing-card featured">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2">
              <span class="rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">
                Popular
              </span>
            </div>

            <div class="mb-6">
              <h3 class="mb-2 text-2xl font-bold">Pro</h3>
              <p class="text-sm text-slate-400">For security-conscious devs</p>
            </div>

            <div class="mb-6">
              <span class="text-4xl font-bold">$9</span>
              <span class="text-sm text-slate-400">/month</span>
            </div>

            <FeatureList features={PRO_FEATURES} />

            <button
              type="button"
              class="btn-primary w-full justify-center text-sm"
              onClick={() => openUpgrade('pro')}
            >
              Upgrade to Pro
            </button>
          </div>

          {/* Team Tier */}
          <div class="pricing-card featured">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2">
              <span class="rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white">
                Best Value
              </span>
            </div>

            <div class="mb-6">
              <h3 class="mb-2 text-2xl font-bold">Team</h3>
              <p class="text-sm text-slate-400">For teams & organizations</p>
            </div>

            <div class="mb-6">
              <span class="text-4xl font-bold">$200</span>
              <span class="text-sm text-slate-400">/month</span>
            </div>

            <FeatureList features={TEAM_FEATURES} />

            <button
              type="button"
              class="btn-primary w-full justify-center text-sm"
              onClick={() => openUpgrade('team')}
            >
              Upgrade to Team
            </button>
          </div>

          {/* Enterprise Tier */}
          <div class="pricing-card">
            <div class="mb-6">
              <h3 class="mb-2 text-2xl font-bold">Enterprise</h3>
              <p class="text-sm text-slate-400">For large organizations</p>
            </div>

            <div class="mb-6">
              <span class="text-3xl font-bold">Custom</span>
              <span class="mt-1 block text-sm text-slate-400">tailored to your needs</span>
            </div>

            <FeatureList features={ENTERPRISE_FEATURES} />

            <a
              href="mailto:enterprise@latham.cloud"
              class="btn-secondary w-full justify-center text-sm"
            >
              Contact Sales
            </a>
          </div>
        </div>

        <p class="mt-8 text-center text-slate-500">
          Need custom terms or volume pricing?{' '}
          <a href="mailto:sales@latham.cloud" class="text-indigo-400 hover:underline">
            Contact sales
          </a>
        </p>
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal()}
        onClose={() => setShowUpgradeModal(false)}
        initialTier={initialTier()}
      />
    </section>
  );
};

export default Pricing;
