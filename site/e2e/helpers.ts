import { expect, type Page } from '@playwright/test';

/**
 * Accessible names of the form controls shared by the login and signup
 * surfaces. Hoisted here because three specs pin these strings; a copy change
 * must update this one constant, not four specs independently.
 */
export const AUTH_FIELDS = {
  emailLabel: 'Email Address',
  passwordLabel: 'Password',
  signInButton: 'Sign In',
} as const;

/** The post-login landing route and its observable heading. */
export const DASHBOARD_URL_PATTERN = /\/dashboard$/;
export const DASHBOARD_HEADING = 'Dashboard';

/**
 * Upper bound for one hydration-tolerant click/assert retry cycle.
 *
 * SolidStart hydrates after the initial paint; a click dispatched before
 * hydration finishes is a silent no-op because delegated event handlers are
 * not attached yet. Callers therefore re-run the whole click/assert pair
 * until the observable effect holds rather than sleeping for a fixed time.
 */
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
 * @param click - The user gesture to repeat until it takes effect. MUST be
 *   safe to repeat: every retry pass fires the gesture again, so a mutating
 *   action (form submit, POST-triggering button) can double-fire if an early
 *   click succeeded slowly. Wrap only idempotent gestures, or re-fill inputs
 *   alongside the click inside the retried unit as `signup.spec.ts` does.
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
 * Callers driving forms inside an `expect(...).toPass()` retry loop must
 * invoke this once per pass: a native GET that slips through resets the
 * document and discards any previously registered listener with the fields.
 *
 * @param page - The page whose forms must never submit natively during the test.
 */
export async function suppressNativeFormSubmission(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener('submit', event => event.preventDefault(), true);
  });
}

/**
 * Log in through the UI with hydration-race protection.
 *
 * Retries fill/click/assert as one unit: the submission guard is re-applied
 * and fields re-filled on every pass unless the hydrated submit already
 * navigated to the dashboard, so neither a pre-hydration native GET nor a
 * slow-but-successful submit leaves the helper wedged.
 *
 * @param page - The page to authenticate.
 * @param email - Credentials for the account under test.
 * @param password - Credentials for the account under test.
 */
export async function performUiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  await expect(async () => {
    // Once the dashboard URL holds, stop driving the form: refilling fields
    // that no longer exist would fail every remaining pass.
    if (!page.url().endsWith('/dashboard')) {
      await suppressNativeFormSubmission(page);
      await page.getByLabel(AUTH_FIELDS.emailLabel).fill(email);
      await page.getByLabel(AUTH_FIELDS.passwordLabel).fill(password);
      await page.getByRole('button', { name: AUTH_FIELDS.signInButton }).click();
    }
    await expect(page).toHaveURL(DASHBOARD_URL_PATTERN);
    await expect(page.getByRole('heading', { name: DASHBOARD_HEADING })).toBeVisible();
  }).toPass({ timeout: HYDRATION_TOLERANT_TIMEOUT });
}
