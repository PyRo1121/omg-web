import { expect, test } from '@playwright/test';
import { AUTH_FIELDS, suppressNativeFormSubmission } from './helpers';

test.describe('password signup surface', () => {
  test('renders the complete signup entry surface', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    // Exact match keeps the main password field distinct from "Confirm Password".
    await expect(page.getByLabel(AUTH_FIELDS.passwordLabel, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up with GitHub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  test('rejects mismatched passwords client-side without leaving the page', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    const createAccount = page.getByRole('button', { name: 'Create Account' });
    // A submit racing hydration fires the browser's native form GET, which
    // resets the document and the fields; the retried unit therefore re-applies
    // the submission guard and refills the form every pass until the
    // hydrated handler observes the mismatch. No sleeps: the pass succeeds as
    // soon as the validation error is observable.
    await expect(async () => {
      // Re-applied every pass on purpose: a native GET submit resets the
      // document, discarding the previously registered guard with the fields.
      await suppressNativeFormSubmission(page);
      await page.getByLabel('Full Name').fill('E2E User');
      await page.getByLabel(AUTH_FIELDS.emailLabel).fill('e2e@example.com');
      await page
        .getByLabel(AUTH_FIELDS.passwordLabel, { exact: true })
        .fill('correct-horse-battery');
      await page.getByLabel('Confirm Password').fill('different-staple');
      await createAccount.click();
      await expect(page.getByText(/passwords do not match/i)).toBeVisible();
    }).toPass();
    await expect(page).toHaveURL(/\/signup\/?$/);
  });
});
