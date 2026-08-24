import type { Component } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';
import UpgradeModal from './UpgradeModal';

const PLANS = [
  { id: 'free', name: 'Free', price: '$0', cadence: 'forever' },
  { id: 'pro', name: 'Pro', price: '$9', cadence: 'per month' },
  { id: 'team', name: 'Team', price: '$200', cadence: 'per month' },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', cadence: 'annual terms' },
] as const;

const FEATURES = [
  {
    label: 'Package and runtime management',
    values: ['Included', 'Included', 'Included', 'Included'],
  },
  { label: 'SBOM and vulnerability scanning', values: ['—', 'Included', 'Included', 'Included'] },
  { label: 'Secret detection', values: ['—', 'Included', 'Included', 'Included'] },
  { label: 'Environment sync', values: ['—', '—', '25 members', 'Custom'] },
  { label: 'Tamper-resistant audit log', values: ['—', '—', 'Included', 'Included'] },
  { label: 'SSO, policy, and provenance', values: ['—', '—', '—', 'Included'] },
] as const;

const Pricing: Component = () => {
  const [showUpgradeModal, setShowUpgradeModal] = createSignal(false);
  const [initialTier, setInitialTier] = createSignal<'pro' | 'team'>('pro');

  const openUpgrade = (tier: 'pro' | 'team'): void => {
    setInitialTier(tier);
    setShowUpgradeModal(true);
  };

  return (
    <section id="pricing" class="manifest-shell manifest-section" aria-labelledby="pricing-title">
      <header class="grid border-b border-[var(--ink)] lg:grid-cols-[1fr_2fr]">
        <div class="border-b border-[var(--rule)] p-6 sm:p-10 lg:border-r lg:border-b-0">
          <span class="manifest-index">05 / PLANS</span>
        </div>
        <div class="p-6 sm:p-10">
          <h2
            id="pricing-title"
            class="text-5xl font-black tracking-[-0.055em] uppercase sm:text-7xl"
          >
            Pay for operational control.
          </h2>
          <p class="mt-5 max-w-2xl text-[var(--ink-muted)]">
            The package manager stays free. Paid plans add security, coordination, and policy.
          </p>
        </div>
      </header>

      <p class="manifest-label border-b border-[var(--ink)] p-4 text-[var(--ink-muted)] md:hidden">
        Swipe horizontally to compare plans →
      </p>
      <div class="overflow-x-auto bg-[var(--paper-raised)]">
        <table class="w-full min-w-[60rem] border-collapse text-left">
          <caption class="sr-only">OMG plan and feature comparison</caption>
          <thead>
            <tr class="border-b border-[var(--ink)] align-top">
              <th scope="col" class="w-1/4 p-6 font-normal">
                <span class="manifest-label text-[var(--ink-muted)]">Capability</span>
              </th>
              <For each={PLANS}>
                {plan => (
                  <th
                    scope="col"
                    class={`border-l p-6 ${plan.id === 'pro' ? 'border-[var(--signal)] bg-[#fff1ee]' : 'border-[var(--rule)]'}`}
                  >
                    <span class="manifest-label text-[var(--ink-muted)]">{plan.name}</span>
                    <strong class="mt-4 block text-4xl tracking-[-0.05em]">{plan.price}</strong>
                    <span class="mt-1 block font-mono text-[10px] font-normal tracking-[0.08em] text-[var(--ink-muted)] uppercase">
                      {plan.cadence}
                    </span>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody class="font-mono text-xs">
            <For each={FEATURES}>
              {feature => (
                <tr class="border-b border-[var(--rule)]">
                  <th scope="row" class="p-5 font-medium">
                    {feature.label}
                  </th>
                  <For each={feature.values}>
                    {(value, index) => (
                      <td
                        class={`border-l p-5 ${index() === 1 ? 'border-[var(--signal)] bg-[#fff1ee]' : 'border-[var(--rule)]'} ${value === '—' ? 'text-[var(--ink-muted)]' : ''}`}
                      >
                        {value}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
            <tr>
              <th scope="row" class="p-5 font-medium">
                Action
              </th>
              <td class="border-l border-[var(--rule)] p-5">
                <a href="#install" class="manifest-button w-full">
                  Install free
                </a>
              </td>
              <td class="border-l border-[var(--signal)] bg-[#fff1ee] p-5">
                <button
                  type="button"
                  class="manifest-button manifest-button--primary w-full"
                  onClick={() => openUpgrade('pro')}
                >
                  Choose Pro
                </button>
              </td>
              <td class="border-l border-[var(--rule)] p-5">
                <button
                  type="button"
                  class="manifest-button w-full"
                  onClick={() => openUpgrade('team')}
                >
                  Choose Team
                </button>
              </td>
              <td class="border-l border-[var(--rule)] p-5">
                <a href="mailto:enterprise@latham.cloud" class="manifest-button w-full">
                  Contact sales
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Show when={showUpgradeModal()}>
        <UpgradeModal
          isOpen={showUpgradeModal()}
          onClose={() => setShowUpgradeModal(false)}
          initialTier={initialTier()}
        />
      </Show>
    </section>
  );
};

export default Pricing;
