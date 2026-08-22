import { expect, type Page } from '@playwright/test';

/**
 * Upper bound for one hydration-tolerant click/assert retry cycle.
 *
 * SolidStart hydrates after the initial paint; a click dispatched before
 * hydration finishes is a silent no-op because delegated event handlers are
 * not attached yet. Callers therefore re-run the whole click/assert pair
 * until the observable effect holds rather than sleeping for a fixed time.
 */
/** Upper bound for one hydration-tolerant click/assert retry cycle. */
export const HYDRATION_TOLERANT_TIMEOUT = 30_000;

/** Extra-patient bound for heavy pages (dev-mode landing page) under slow hydration. */
export const PATIENT_HYDRATION_TIMEOUT = 60_000;

/**
 * Perform `click`, then require `effect` to hold, retrying both as a unit.
 *
 * If the click lands in the pre-hydration window the assertion fails and
 * `expect.toPass` reruns the pair once handlers are live. This removes the
 * flaky no-op-click class without arbitrary waits: the test passes as soon as
 * the effect is observable and fails at the bounded timeout if never.
 *
 * @param click - The user gesture to repeat until it takes effect.
 * @param effect - The observable consequence proving the click reached a live handler.
 * @param options - Optional overrides; `timeout` bounds the whole retry cycle.
 */
export async function clickUntilEffectHolds(
  click: () => Promise<void>,
  effect: () => Promise<void>,
  options?: { readonly timeout?: number }
): Promise<void> {
  await expect(async () => {
    await click();
    await effect();
  }).toPass({ timeout: options?.timeout ?? HYDRATION_TOLERANT_TIMEOUT });
}

/**
 * Block the browser's native form submission for the lifetime of the page.
 *
 * Auth forms are server-rendered without an `action`; a submit click racing
 * hydration would otherwise trigger a full-page GET (leaking field values,
 * including passwords, into the URL query) before Solid's submit handler is
 * attached. A capture-phase listener prevents the default action regardless
 * of hydration state while still letting Solid's delegated submit handler run
 * once hydrated.
 *
 * @param page - The page whose forms must never submit natively during the test.
 */
export async function suppressNativeFormSubmission(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener('submit', event => event.preventDefault(), true);
  });
}
