import type { Component } from 'solid-js';
import { For, Show, createSignal, onMount } from 'solid-js';
import { parseLicenseLookup } from '../../lib/dashboard-contract';
import { reportClientError } from '../../lib/observability';

const LICENSE_API_BASE = 'https://omg-api.latham.cloud';

const CONFETTI_COLORS = ['#6366f1', '#8b5cf6', '#22d3ee', '#34d399', '#f59e0b'];

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
 * Post-checkout license retrieval dialog.
 *
 * Opens itself when the Stripe checkout redirects back with ?success=true,
 * then lets the buyer look up their license key by email.
 */
export const LicenseSuccessModal: Component = () => {
  const [showSuccess, setShowSuccess] = createSignal(false);
  const [licenseKey, setLicenseKey] = createSignal<string | null>(null);
  const [tier, setTier] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [email, setEmail] = createSignal('');
  const [copied, setCopied] = createSignal(false);
  const [confetti, setConfetti] = createSignal<ConfettiPiece[]>([]);
  const [notFound, setNotFound] = createSignal(false);
  const [retryCount, setRetryCount] = createSignal(0);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setShowSuccess(true);
      setConfetti(spawnConfettiPieces());
      setTimeout(() => setConfetti([]), 4000);
      window.history.replaceState({}, '', '/');
    }
  });

  const fetchLicense = async (): Promise<void> => {
    const userEmail = email();
    if (!userEmail) {
      return;
    }

    setLoading(true);
    setNotFound(false);

    try {
      const res = await fetch(
        `${LICENSE_API_BASE}/api/get-license?email=${encodeURIComponent(userEmail)}`
      );
      const parsed = parseLicenseLookup(await res.json());
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      if (parsed.value.found) {
        setLicenseKey(parsed.value.license_key);
        setTier(parsed.value.tier);
      } else {
        setNotFound(true);
        setRetryCount(count => count + 1);
      }
    } catch (e) {
      reportClientError('Unhandled client operation failed', e);
      setNotFound(true);
    }
    setLoading(false);
  };

  const copyToClipboard = (text: string): void => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (): void => {
    setShowSuccess(false);
    setLicenseKey(null);
    setTier(null);
    setEmail('');
    setNotFound(false);
    setRetryCount(0);
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
          <div class="relative w-full max-w-lg rounded-3xl border border-slate-700/50 bg-gradient-to-b from-slate-800 to-slate-900 p-8 shadow-2xl">
            <button
              type="button"
              onClick={handleClose}
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

            <Show when={!licenseKey()}>
              <div class="text-center">
                <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500">
                  <svg
                    class="h-10 w-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Payment confirmed</title>
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 class="mb-2 text-3xl font-bold text-white">Payment Successful!</h2>
                <p class="mb-6 text-slate-400">
                  Thank you for your purchase. Enter your email to retrieve your license key.
                </p>

                <input
                  type="email"
                  value={email()}
                  onInput={e => setEmail(e.currentTarget.value)}
                  onKeyDown={e => e.key === 'Enter' && void fetchLicense()}
                  placeholder="Enter your email"
                  class="mb-4 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />

                <Show when={notFound()}>
                  <p class="mb-4 text-sm text-amber-400">
                    License not found yet. It may take a moment to process.
                    {retryCount() > 0 && ` (Attempt ${retryCount()})`}
                  </p>
                </Show>

                <button
                  type="button"
                  onClick={() => void fetchLicense()}
                  disabled={loading() || !email()}
                  class="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 py-3 font-semibold text-white transition-all hover:from-indigo-400 hover:to-purple-400 disabled:from-slate-600 disabled:to-slate-600"
                >
                  {loading() ? 'Checking...' : 'Get License Key'}
                </button>
              </div>
            </Show>

            <Show when={licenseKey()}>
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
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
                <h2 class="mb-2 text-3xl font-bold text-white">Your License Key</h2>
                <p class="mb-2 text-slate-400">
                  <span class="font-semibold text-indigo-400 capitalize">{tier()}</span> Plan
                  Activated
                </p>

                <div class="mb-6 rounded-xl bg-slate-800 p-4">
                  <code class="font-mono text-sm break-all text-green-400">{licenseKey()}</code>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const key = licenseKey();
                    if (key) {
                      copyToClipboard(key);
                    }
                  }}
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
                  <code class="font-mono text-xs text-cyan-400">
                    omg license activate {licenseKey()}
                  </code>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
};
