import { expect, test } from '@playwright/test';
import { clickUntilEffectHolds, PATIENT_HYDRATION_TIMEOUT } from './helpers';

// The decorative canvas animation on the landing page keeps a requestAnimationFrame
// loop alive and has crashed resource-constrained local Chromium mid-test; it
// honors prefers-reduced-motion, so emulate it to keep the run deterministic.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('checkout degradation', () => {
  // Characterizes the anonymous, unconfigured-backend path: without a session
  // (and/or without Stripe configured) the BFF rejects checkout with 401/5xx.
  // The modal must degrade to an inline, recoverable error — never an
  // external redirect and never a silent spinner.
  test('surfaces a recoverable error and stays on the site when checkout is unavailable', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const planPicker = page.getByRole('heading', { name: 'Choose Your Plan' });
    await clickUntilEffectHolds(
      () => page.getByRole('button', { name: 'Upgrade to Pro' }).click(),
      async () => {
        await expect(planPicker).toBeVisible();
      },
      { timeout: PATIENT_HYDRATION_TIMEOUT }
    );

    // The modal is client-rendered, so reaching it proves hydration completed;
    // the remaining interactions can click directly.
    await page.getByRole('button', { name: 'Select Pro' }).click();
    const continueButton = page.getByRole('button', { name: /Continue to Checkout/ });
    await expect(continueButton).toBeVisible();

    // Anonymous deployments reject with 401 ("sign in first"); unconfigured
    // ones reject with a 5xx. Both must land in the same recoverable state.
    await clickUntilEffectHolds(
      () => continueButton.click(),
      async () => {
        await expect(
          page.getByText(/before starting checkout|Unable to start checkout/)
        ).toBeVisible();
        await expect(continueButton).toBeEnabled();
      }
    );

    await expect(page).toHaveURL(/\/$/);
  });
});
