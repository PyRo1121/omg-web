import { Dialog } from '@kobalte/core';
import { Check, Copy, LoaderCircle, X } from 'lucide-solid';
import { type Component, createSignal, Show } from 'solid-js';
import { claimMarketingOffer } from '~/lib/api';
import type { MarketingOfferResponse } from '../../shared/marketing-offer';

interface MarketingOfferDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOfferCreated: (offer: MarketingOfferResponse) => void;
  readonly onChoosePro: () => void;
}

const MarketingOfferDialog: Component<MarketingOfferDialogProps> = props => {
  const [email, setEmail] = createSignal('');
  const [offer, setOffer] = createSignal<MarketingOfferResponse | null>(null);
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const claimed = await claimMarketingOffer(email());
      setOffer(claimed);
      props.onOfferCreated(claimed);
    } catch {
      setError('We could not create the offer right now. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async (): Promise<void> => {
    const current = offer();
    if (current === null) return;
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const choosePro = async (): Promise<void> => {
    await copyCode();
    props.onOpenChange(false);
    props.onChoosePro();
  };

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/85" />
        <div class="fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4">
          <Dialog.Content class="relative w-full max-w-2xl overflow-hidden border border-t-4 border-[var(--rule-strong)] border-t-[var(--signal)] bg-[var(--paper-raised)] p-7 shadow-[0_3rem_10rem_rgba(0,0,0,0.55)] sm:p-10">
            <Dialog.CloseButton
              class="absolute top-5 right-5 grid h-10 w-10 place-items-center border border-[var(--rule)] text-[var(--ink-muted)] hover:bg-white/[0.06] hover:text-[var(--ink)]"
              aria-label="Close offer"
            >
              <X size={18} strokeWidth={1.5} />
            </Dialog.CloseButton>

            <Show
              when={offer()}
              fallback={
                <>
                  <Dialog.Title class="max-w-lg pr-10 text-4xl leading-[0.98] font-medium tracking-[-0.05em] sm:text-5xl">
                    Take 20% off your first three months.
                  </Dialog.Title>
                  <Dialog.Description class="mt-5 max-w-lg leading-relaxed text-[var(--ink-muted)]">
                    Enter your email and we will create a single-use Stripe promotion code for Pro
                    or Team.
                  </Dialog.Description>

                  <form onSubmit={event => void submit(event)} class="mt-9">
                    <label for="offer-email" class="mb-2 block text-sm text-[var(--ink-muted)]">
                      Email address
                    </label>
                    <span class="flex flex-col gap-3 sm:flex-row">
                      <input
                        id="offer-email"
                        type="email"
                        autocomplete="email"
                        required
                        value={email()}
                        onInput={event => setEmail(event.currentTarget.value)}
                        class="min-h-12 flex-1 border border-[var(--rule-strong)] bg-white/[0.035] px-5 text-sm outline-none placeholder:text-[#77736e] focus:border-[var(--signal)]"
                        placeholder="you@company.com"
                      />
                      <button
                        type="submit"
                        disabled={loading()}
                        class="manifest-button manifest-button--primary min-w-36"
                      >
                        <Show when={loading()} fallback="Create my code">
                          <LoaderCircle class="h-4 w-4 animate-spin" /> Creating
                        </Show>
                      </button>
                    </span>
                    <Show when={error()}>
                      <p role="alert" class="mt-3 text-sm text-[var(--danger)]">
                        {error()}
                      </p>
                    </Show>
                  </form>

                  <p class="mt-7 text-xs leading-relaxed text-[#69736b]">
                    One code per email, one redemption, valid for a first Stripe transaction.
                    Submitting does not subscribe you to marketing email. See our{' '}
                    <a href="/privacy" class="underline hover:text-[var(--ink)]">
                      privacy policy
                    </a>
                    .
                  </p>
                </>
              }
            >
              {current => (
                <>
                  <p class="text-sm font-medium text-[var(--signal)]">Your offer is ready</p>
                  <Dialog.Title class="mt-4 text-4xl leading-[0.98] font-medium tracking-[-0.05em] sm:text-5xl">
                    20% off for three months.
                  </Dialog.Title>
                  <Dialog.Description class="mt-5 text-[var(--ink-muted)]">
                    We will apply this code automatically when you choose a plan using the same
                    account email. It expires {new Date(current().expiresAt).toLocaleDateString()}.
                  </Dialog.Description>

                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    class="mt-9 flex w-full items-center justify-between border border-[var(--rule-strong)] bg-[var(--paper)] px-5 py-5 text-left font-mono text-lg tracking-[0.08em] text-[var(--ink)] hover:border-[var(--signal)]"
                  >
                    {current().code}
                    <Show when={copied()} fallback={<Copy size={18} strokeWidth={1.5} />}>
                      <Check size={18} strokeWidth={1.5} class="text-[var(--signal)]" />
                    </Show>
                  </button>

                  <button
                    type="button"
                    onClick={() => void choosePro()}
                    class="manifest-button manifest-button--primary mt-5 w-full"
                  >
                    Copy and choose Pro
                  </button>
                </>
              )}
            </Show>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default MarketingOfferDialog;
