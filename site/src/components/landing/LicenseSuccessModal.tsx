import { Dialog } from '@kobalte/core';
import { Check, Copy, KeyRound, LoaderCircle, X } from 'lucide-solid';
import type { Component } from 'solid-js';
import { createMemo, createSignal, onMount, Show } from 'solid-js';
import { parseCheckoutSessionStatus } from '../../lib/dashboard-contract';
import { reportClientError } from '../../lib/observability';

const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9]{10,200}$/;

type FulfillmentState =
  | { readonly _tag: 'verifying' }
  | { readonly _tag: 'ready'; readonly licenseKey: string; readonly tier: string }
  | { readonly _tag: 'processing'; readonly email: string | null }
  | { readonly _tag: 'unverified' };

async function verifyCheckoutSession(
  sessionId: string
): Promise<{ readonly ok: true; readonly state: FulfillmentState } | { readonly ok: false }> {
  try {
    const response = await fetch(
      `/api/licensing/api/billing/checkout-session?id=${encodeURIComponent(sessionId)}`,
      { credentials: 'same-origin' }
    );
    if (!response.ok) {
      return { ok: false };
    }
    const parsed = parseCheckoutSessionStatus(await response.json());
    if (!parsed.ok) {
      reportClientError('Checkout session response has an invalid shape', parsed.error);
      return { ok: false };
    }
    const license = parsed.value.license;
    if (parsed.value.status === 'paid' && license !== undefined && license !== null) {
      return {
        ok: true,
        state: { _tag: 'ready', licenseKey: license.license_key, tier: license.tier },
      };
    }
    if (parsed.value.status === 'paid') {
      return { ok: true, state: { _tag: 'processing', email: parsed.value.email ?? null } };
    }
    return { ok: true, state: { _tag: 'unverified' } };
  } catch (cause: unknown) {
    reportClientError('Unhandled client operation failed', cause);
    return { ok: false };
  }
}

export const LicenseSuccessModal: Component = () => {
  const [open, setOpen] = createSignal(false);
  const [state, setState] = createSignal<FulfillmentState>({ _tag: 'verifying' });
  const [copied, setCopied] = createSignal(false);

  const ready = createMemo(() => {
    const current = state();
    return current._tag === 'ready'
      ? { licenseKey: current.licenseKey, tier: current.tier }
      : undefined;
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', '/');
    if (params.get('success') !== 'true' || sessionId === null) {
      return;
    }
    setOpen(true);
    if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
      setState({ _tag: 'unverified' });
      return;
    }
    setState({ _tag: 'verifying' });
    void verifyCheckoutSession(sessionId).then(result => {
      setState(result.ok ? result.state : { _tag: 'unverified' });
    });
  });

  const copyLicense = async (licenseKey: string): Promise<void> => {
    await navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const close = (): void => {
    setOpen(false);
    setState({ _tag: 'verifying' });
  };

  return (
    <Dialog.Root open={open()} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <div class="fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4">
          <Dialog.Content class="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--rule-strong)] bg-[var(--paper-raised)] shadow-[0_3rem_10rem_rgba(0,0,0,0.5)]">
            <header class="flex items-start justify-between border-b border-[var(--rule)] p-5 sm:p-7">
              <div>
                <p class="font-mono text-xs text-[var(--signal)]">License fulfillment</p>
                <Dialog.Title
                  id="license-success-title"
                  class="mt-2 text-3xl font-medium tracking-[-0.045em]"
                >
                  {state()._tag === 'ready' ? 'License ready' : 'Purchase status'}
                </Dialog.Title>
                <Dialog.Description class="mt-2 text-sm text-[var(--ink-muted)]">
                  OMG verifies payment against your signed-in account before displaying a license.
                </Dialog.Description>
              </div>
              <Dialog.CloseButton
                class="grid h-10 w-10 place-items-center rounded-full border border-[var(--rule-strong)] hover:bg-white/[0.07]"
                aria-label="Close license status"
              >
                <X size={18} strokeWidth={1.5} />
              </Dialog.CloseButton>
            </header>

            <Show when={ready()}>
              {snapshot => (
                <div class="grid md:grid-cols-[13rem_1fr]">
                  <aside class="flex flex-col justify-between border-b border-[var(--rule)] bg-[var(--signal)] p-6 text-[var(--signal-ink)] md:border-r md:border-b-0">
                    <KeyRound size={32} strokeWidth={1.25} />
                    <div class="mt-20">
                      <p class="manifest-label">Plan</p>
                      <strong class="mt-2 block text-3xl">{snapshot().tier}</strong>
                    </div>
                  </aside>
                  <div class="p-6 sm:p-8">
                    <p class="manifest-label text-[var(--ink-muted)]">License key</p>
                    <code class="mt-4 block border border-[var(--ink)] bg-[var(--paper-muted)] p-4 text-sm break-all text-[var(--ink)]">
                      {snapshot().licenseKey}
                    </code>
                    <button
                      type="button"
                      class="manifest-button manifest-button--primary mt-4 w-full"
                      onClick={() => void copyLicense(snapshot().licenseKey)}
                    >
                      <Show
                        when={copied()}
                        fallback={
                          <>
                            <Copy size={16} strokeWidth={1.5} /> Copy key
                          </>
                        }
                      >
                        <Check size={16} strokeWidth={1.5} /> Copied
                      </Show>
                    </button>
                    <p class="manifest-label mt-8 text-[var(--ink-muted)]">Activate</p>
                    <code class="mt-3 block overflow-x-auto border-t border-[var(--rule)] pt-4 text-xs">
                      omg license activate {snapshot().licenseKey}
                    </code>
                  </div>
                </div>
              )}
            </Show>

            <Show when={state()._tag !== 'ready'}>
              <div class="p-8 sm:p-12">
                <Show when={state()._tag === 'verifying'}>
                  <LoaderCircle
                    class="h-8 w-8 animate-spin text-[var(--signal)]"
                    strokeWidth={1.5}
                  />
                  <h3 class="mt-8 text-3xl font-black tracking-[-0.045em] uppercase">
                    Verifying payment
                  </h3>
                  <p class="mt-3 text-[var(--ink-muted)]">
                    This usually completes as soon as Stripe confirms the session.
                  </p>
                </Show>
                <Show when={state()._tag === 'processing'}>
                  <h3 class="text-3xl font-black tracking-[-0.045em] uppercase">
                    Provisioning license
                  </h3>
                  <p class="mt-3 text-[var(--ink-muted)]">
                    Payment is confirmed. The signed webhook is creating the entitlement.
                  </p>
                </Show>
                <Show when={state()._tag === 'unverified'}>
                  <h3 class="text-3xl font-black tracking-[-0.045em] uppercase">
                    Verification unavailable
                  </h3>
                  <p class="mt-3 text-[var(--ink-muted)]">
                    Open the dashboard to inspect active licenses or use the receipt sent by Stripe.
                  </p>
                </Show>
                <button type="button" class="manifest-button mt-8" onClick={close}>
                  Close
                </button>
              </div>
            </Show>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
