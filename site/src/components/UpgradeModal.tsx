import { Dialog } from '@kobalte/core';
import { ArrowLeft, Check, LoaderCircle, X } from 'lucide-solid';
import { type Component, createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import type { MarketingPromotionCode } from '../../shared/marketing-offer';
import { ApiError } from '../lib/api-error';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTier?: 'pro' | 'team';
  promotionCode: MarketingPromotionCode | undefined;
  restoreFocus: () => void;
}

const TIERS = {
  pro: {
    name: 'Pro',
    price: 9,
    description: 'Security controls for individual developers',
    features: ['SBOM generation', 'Vulnerability scanning', 'Secret detection'],
  },
  team: {
    name: 'Team',
    price: 200,
    description: 'Shared controls for teams and organizations',
    features: ['Everything in Pro', 'Environment sync', 'Audit log', 'Up to 10 members'],
  },
} as const;

const UpgradeModal: Component<UpgradeModalProps> = props => {
  const [step, setStep] = createSignal<'select' | 'details' | 'processing'>('select');
  const [selectedTier, setSelectedTier] = createSignal<'pro' | 'team'>(props.initialTier ?? 'pro');
  const [error, setError] = createSignal<string | null>(null);
  let redirectTimer: ReturnType<typeof setTimeout> | undefined;
  let checkoutAttempt = 0;

  const cancelCheckout = (): void => {
    checkoutAttempt += 1;
    if (redirectTimer !== undefined) {
      clearTimeout(redirectTimer);
      redirectTimer = undefined;
    }
  };

  const close = (): void => {
    cancelCheckout();
    setStep('select');
    setError(null);
    props.onClose();
  };

  createEffect(() => {
    if (props.isOpen) {
      setSelectedTier(props.initialTier ?? 'pro');
    } else {
      cancelCheckout();
    }
  });

  onCleanup(cancelCheckout);

  const chooseTier = (tier: 'pro' | 'team'): void => {
    setSelectedTier(tier);
    setStep('details');
  };

  const startCheckout = async (): Promise<void> => {
    const attempt = checkoutAttempt + 1;
    checkoutAttempt = attempt;
    setError(null);
    setStep('processing');

    try {
      const { createCheckout } = await import('../lib/api');
      const checkout = await createCheckout(selectedTier(), props.promotionCode);
      if (!URL.canParse(checkout.url)) {
        setError('Checkout returned an invalid redirect.');
        setStep('details');
        return;
      }
      const checkoutUrl = new URL(checkout.url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
        setError('Checkout returned an untrusted redirect.');
        setStep('details');
        return;
      }
      if (!props.isOpen || attempt !== checkoutAttempt) {
        return;
      }
      redirectTimer = setTimeout(() => {
        redirectTimer = undefined;
        if (!props.isOpen || attempt !== checkoutAttempt) {
          return;
        }
        const link = document.createElement('a');
        link.href = checkoutUrl.toString();
        link.rel = 'noopener noreferrer';
        link.click();
      }, 500);
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? 'Sign in before starting checkout.'
          : cause instanceof ApiError && cause.status === 400 && props.promotionCode !== undefined
            ? 'This offer must be used with the same account email that requested it.'
            : 'Unable to start checkout. Please try again.'
      );
      setStep('details');
    }
  };

  return (
    <Dialog.Root open={props.isOpen} onOpenChange={open => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/85" />
        <div class="fixed inset-0 z-40 grid items-start overflow-y-auto p-2 sm:place-items-center sm:p-4">
          <Dialog.Content
            class="relative my-auto max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto border border-[var(--rule-strong)] bg-[var(--paper-raised)] shadow-[0_3rem_10rem_rgba(0,0,0,0.5)] sm:max-h-[calc(100dvh-2rem)]"
            onCloseAutoFocus={event => {
              event.preventDefault();
              props.restoreFocus();
            }}
          >
            <header class="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--rule)] bg-[var(--paper-raised)] p-5 sm:p-7">
              <div>
                <p class="font-mono text-xs text-[var(--signal)]">Secure checkout</p>
                <Dialog.Title class="mt-2 text-3xl font-medium tracking-[-0.045em]">
                  {step() === 'select' ? 'Choose a plan' : 'Review the order'}
                </Dialog.Title>
                <Dialog.Description class="mt-2 text-sm text-[var(--ink-muted)]">
                  Checkout uses the identity on your signed-in OMG account.
                </Dialog.Description>
              </div>
              <Dialog.CloseButton
                class="grid h-10 w-10 shrink-0 place-items-center border border-[var(--rule-strong)] hover:bg-white/[0.07]"
                aria-label="Close checkout"
              >
                <X size={18} strokeWidth={1.5} />
              </Dialog.CloseButton>
            </header>

            <Show when={step() === 'select'}>
              <div class="grid md:grid-cols-2">
                <For each={['pro', 'team'] as const}>
                  {tierKey => {
                    const tier = TIERS[tierKey];
                    return (
                      <button
                        type="button"
                        class="group border-b border-[var(--rule)] p-5 text-left hover:bg-white/[0.035] sm:p-8 md:min-h-96 md:border-r md:border-b-0 md:last:border-r-0"
                        onClick={() => chooseTier(tierKey)}
                      >
                        <span class="manifest-label text-[var(--signal)]">{tier.name}</span>
                        <strong class="mt-5 block text-6xl tracking-[-0.065em]">
                          ${tier.price}
                        </strong>
                        <span class="font-mono text-[10px] tracking-[0.08em] text-[var(--ink-muted)] uppercase">
                          per month
                        </span>
                        <p class="mt-8 max-w-xs text-sm text-[var(--ink-muted)]">
                          {tier.description}
                        </p>
                        <ul class="mt-8 space-y-3 p-0 font-mono text-xs">
                          <For each={tier.features}>
                            {feature => (
                              <li class="flex items-center gap-2">
                                <Check size={14} strokeWidth={1.5} class="text-[var(--signal)]" />
                                {feature}
                              </li>
                            )}
                          </For>
                        </ul>
                        <span class="manifest-button mt-8 group-hover:bg-[var(--ink)] group-hover:text-[var(--paper)]">
                          Select {tier.name}
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>

            <Show when={step() !== 'select'}>
              <div class="grid md:grid-cols-[1fr_1.2fr]">
                <aside class="border-b border-[var(--rule)] bg-[var(--paper-muted)] p-6 text-[var(--ink)] sm:p-8 md:border-r md:border-b-0">
                  <button
                    type="button"
                    class="manifest-label flex items-center gap-2 text-[#aaa59a] hover:text-[var(--paper-raised)]"
                    onClick={() => setStep('select')}
                  >
                    <ArrowLeft size={14} strokeWidth={1.5} /> Change plan
                  </button>
                  <p class="mt-16 text-5xl font-black tracking-[-0.055em] uppercase">
                    {TIERS[selectedTier()].name}
                  </p>
                  <p class="mt-3 text-sm text-[#aaa59a]">{TIERS[selectedTier()].description}</p>
                  <data class="mt-12 block font-mono text-4xl">
                    ${TIERS[selectedTier()].price}
                    <span class="text-xs text-[#aaa59a]"> / month</span>
                  </data>
                </aside>

                <div class="p-6 sm:p-8">
                  <h3 class="manifest-label text-[var(--ink-muted)]">Included capabilities</h3>
                  <ul class="mt-5 divide-y divide-[var(--rule)] border-y border-[var(--rule)] p-0 font-mono text-xs">
                    <For each={TIERS[selectedTier()].features}>
                      {feature => (
                        <li class="flex items-center gap-3 py-4">
                          <Check size={14} strokeWidth={1.5} class="text-[var(--signal)]" />
                          {feature}
                        </li>
                      )}
                    </For>
                  </ul>

                  <Show when={props.promotionCode}>
                    {code => (
                      <p class="mt-5 rounded-xl border border-[var(--signal)]/30 bg-[var(--signal)]/8 px-4 py-3 text-sm text-[var(--signal)]">
                        Introductory 20% discount ready · <span class="font-mono">{code()}</span>
                      </p>
                    )}
                  </Show>

                  <Show when={error()}>
                    <div
                      role="alert"
                      class="mt-5 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/8 p-4 text-sm text-[var(--danger)]"
                    >
                      {error()}
                    </div>
                  </Show>

                  <button
                    type="button"
                    class="manifest-button manifest-button--primary mt-7 w-full"
                    disabled={step() === 'processing'}
                    onClick={() => void startCheckout()}
                  >
                    <Show when={step() === 'processing'} fallback="Continue to Stripe">
                      <LoaderCircle size={16} class="animate-spin" /> Opening checkout
                    </Show>
                  </button>
                  <p class="mt-4 font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
                    Stripe processes payment details. OMG never receives card numbers.
                  </p>
                </div>
              </div>
            </Show>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default UpgradeModal;
