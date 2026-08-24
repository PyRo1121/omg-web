import type { Component } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { parseCheckoutSessionStatus } from '../../lib/dashboard-contract';
import { reportClientError } from '../../lib/observability';

const CONFETTI_COLORS = ['#6366f1', '#8b5cf6', '#22d3ee', '#34d399', '#f59e0b'];

/** Stripe Checkout Session ids are high-entropy capabilities; bound the shape. */
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9]{10,200}$/;

type FulfillmentState =
  | { readonly _tag: 'verifying' }
  | {
      readonly _tag: 'ready';
      readonly licenseKey: string;
      readonly tier: string;
    }
  | { readonly _tag: 'processing'; readonly email: string | null }
  | { readonly _tag: 'unverified' };

interface ConfettiPiece {
  readonly id: number;
  readonly left: number;
  readonly color: string;
  readonly delay: number;
}

function spawnConfettiPieces(): ConfettiPiece[] {
  return Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? '#6366f1',
    delay: Math.random() * 0.5,
  }));
}

/**
 * Verify a Checkout Session server-side and derive the dialog state.
 *
 * The authenticated site BFF binds the session probe to the account that
 * created checkout; the redirect parameter alone never grants trust.
 */
async function verifyCheckoutSession(
  sessionId: string
): Promise<{ readonly ok: true; readonly state: FulfillmentState } | { readonly ok: false }> {
  try {
    const res = await fetch(
      `/api/licensing/api/billing/checkout-session?id=${encodeURIComponent(sessionId)}`,
      { credentials: 'same-origin' }
    );
    if (!res.ok) {
      return { ok: false };
    }
    const parsed = parseCheckoutSessionStatus(await res.json());
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
  } catch (e) {
    reportClientError('Unhandled client operation failed', e);
    return { ok: false };
  }
}

/**
 * Post-checkout fulfillment dialog.
 *
 * Opens itself when the Stripe checkout redirects back with
 * ?success=true&session_id={CHECKOUT_SESSION_ID}, verifies the session against
 * the billing API, and hands out the license key once the signed webhook has
 * provisioned it. The redirect parameters are never treated as proof of
 * payment — entitlements are granted exclusively by webhook reconciliation.
 */
export const LicenseSuccessModal: Component = () => {
  const [showSuccess, setShowSuccess] = createSignal(false);
  const [state, setState] = createSignal<FulfillmentState>({ _tag: 'verifying' });

  // Snapshot accessors: each state() call is an independent read, so JSX-level
  // narrowing cannot flow between them. These memos narrow once and stay
  // reactive.
  const ready = createMemo(() => {
    const s = state();
    return s._tag === 'ready' ? { licenseKey: s.licenseKey, tier: s.tier } : undefined;
  });
  const processing = createMemo(() => {
    const s = state();
    return s._tag === 'processing' ? { email: s.email } : undefined;
  });

  const [copied, setCopied] = createSignal(false);
  const [confetti, setConfetti] = createSignal<ConfettiPiece[]>([]);
  let panelRef: HTMLDivElement | undefined;
  let previouslyFocused: Element | null = null;

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', '/');
    if (params.get('success') !== 'true' || sessionId === null) {
      return;
    }
    if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
      setShowSuccess(true);
      setState({ _tag: 'unverified' });
      return;
    }

    setShowSuccess(true);
    setState({ _tag: 'verifying' });
    setConfetti(spawnConfettiPieces());
    const confettiTimer = setTimeout(() => setConfetti([]), 4000);
    onCleanup(() => clearTimeout(confettiTimer));

    void verifyCheckoutSession(sessionId).then(result => {
      setState(result.ok ? result.state : { _tag: 'unverified' });
    });
  });

  // Dialog lifecycle: initial focus, focus containment/restoration, Escape.
  createEffect(() => {
    if (!showSuccess()) {
      return;
    }
    previouslyFocused = document.activeElement;
    const focusTimer = setTimeout(() => {
      panelRef?.querySelector<HTMLElement>('button')?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef) {
        return;
      }
      const focusable = panelRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (!firstElement || !lastElement) {
        return;
      }
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    });
  });

  const copyToClipboard = (text: string): void => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (): void => {
    setShowSuccess(false);
    setState({ _tag: 'verifying' });
    setConfetti([]);
  };

  return (
    <>
      <For each={confetti()}>
        {piece => (
          <div
            class="animate-confetti pointer-events-none fixed top-0 z-[200] h-3 w-3 rounded-full"
            style={{
              left: `${piece.left}%`,
              background: piece.color,
              'animation-delay': `${piece.delay}s`,
            }}
          />
        )}
      </For>

      <Show when={showSuccess()}>
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close payment success dialog"
            class="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={handleClose}
          />
          <div
            ref={el => (panelRef = el)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-success-title"
            class="relative w-full max-w-lg rounded-3xl border border-slate-700/50 bg-gradient-to-b from-slate-800 to-slate-900 p-8 shadow-2xl"
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close license retrieval dialog"
              class="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>Close</title>
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <Show when={ready()}>
              {snapshot => (
                <div class="text-center">
                  <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500">
                    <svg
                      class="h-10 w-10 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>License key</title>
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.703l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  </div>
                  <h2 id="license-success-title" class="mb-2 text-3xl font-bold text-white">
                    Your License Key
                  </h2>
                  <p class="mb-2 text-slate-400">
                    <span class="font-semibold text-indigo-400 capitalize">{snapshot().tier}</span>{' '}
                    Plan Activated
                  </p>

                  <div class="mb-6 rounded-xl bg-slate-800 p-4">
                    <code class="font-mono text-sm break-all text-green-400">
                      {snapshot().licenseKey}
                    </code>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(snapshot().licenseKey)}
                    class="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 py-3 font-semibold text-white transition-all hover:bg-slate-600"
                  >
                    {copied() ? (
                      <>
                        <svg
                          class="h-5 w-10 text-green-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <title>Copied</title>
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg class="h-5 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <title>Copy license key</title>
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy to Clipboard
                      </>
                    )}
                  </button>

                  <div class="rounded-xl bg-slate-800/50 p-4 text-left">
                    <p class="mb-2 text-sm text-slate-300">Activate your license:</p>
                    <code class="font-mono text-xs break-all text-cyan-400">
                      omg license activate {snapshot().licenseKey}
                    </code>
                  </div>
                </div>
              )}
            </Show>

            <Show when={state()._tag !== 'ready'}>
              <div class="text-center">
                <div class="mx-auto mb-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500">
                  <svg
                    class="h-10 w-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Purchase received</title>
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 id="license-success-title" class="mb-2 text-3xl font-bold text-white">
                  Thank You for Your Purchase
                </h2>
                <Show when={state()._tag === 'verifying'}>
                  <p class="text-slate-400">Verifying your payment…</p>
                </Show>
                <Show when={state()._tag === 'processing'}>
                  <p class="mb-2 text-slate-400">
                    Payment confirmed! Your license is being provisioned — it usually takes less
                    than a minute.
                  </p>
                  <Show when={processing() !== undefined}>
                    <p class="text-sm text-slate-500">A receipt is on its way to your inbox.</p>
                  </Show>
                </Show>
                <Show when={state()._tag === 'unverified'}>
                  <p class="mb-2 text-slate-400">
                    We could not verify this checkout link. Your receipt and license key will arrive
                    by email within a few minutes, or open your dashboard to view active licenses.
                  </p>
                </Show>

                <button
                  type="button"
                  onClick={handleClose}
                  class="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 py-3 font-semibold text-white transition-all hover:from-indigo-400 hover:to-purple-400"
                >
                  Done
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
};
