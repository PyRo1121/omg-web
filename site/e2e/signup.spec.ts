import { expect, test } from '@playwright/test';
import { AUTH_FIELDS } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('OAuth-only signup surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  });

  test('renders the verified GitHub identity provider', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Bring your toolchain into focus.' })
    ).toBeVisible();
    await expect(page.getByText(/Create an account with a verified identity/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  test('does not expose password registration controls', async ({ page }) => {
    await expect(page.getByLabel(AUTH_FIELDS.emailLabel)).toHaveCount(0);
    await expect(page.getByLabel(AUTH_FIELDS.passwordLabel, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
    await expect(page.getByText(/OAuth-only registration ensures/)).toBeVisible();
  });
});
