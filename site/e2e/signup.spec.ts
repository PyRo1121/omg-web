import { expect, test, type Page } from '@playwright/test';
import { HYDRATION_TOLERANT_TIMEOUT, suppressNativeFormSubmission } from './helpers';

// TODO(a11y): signup inputs are not programmatically labeled (no htmlFor/id,
// unlike /login), so accessible names currently fall back to placeholders.
// Once the markup associates labels, switch these locators to getByLabel.
function fullNameInput(page: Page) {
  return page.getByRole('textbox', { name: 'John Doe' });
}

test.describe('password signup surface', () => {
  test('renders the complete signup entry surface', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    // Exact match keeps the main password field distinct from "Confirm Password".
    await expect(page.getByRole('textbox', { name: 'At least 8 characters' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Confirm your password' })).toBeVisible();
    await expect(fullNameInput(page)).toBeVisible();
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
      await suppressNativeFormSubmission(page);
      await fullNameInput(page).fill('E2E User');
      await page.getByRole('textbox', { name: 'dev@example.com' }).fill('e2e@example.com');
      await page
        .getByRole('textbox', { name: 'At least 8 characters' })
        .fill('correct-horse-battery');
      await page
        .getByRole('textbox', { name: 'Confirm your password' })
        .fill('correct-horse-battery-staple');
      await createAccount.click();
      await expect(page.getByText('Passwords do not match')).toBeVisible();
    }).toPass({ timeout: HYDRATION_TOLERANT_TIMEOUT });

    // The mismatch gate fires before any auth request: the URL must be unchanged.
    await expect(page).toHaveURL(/\/signup\/?$/);
  });
});
