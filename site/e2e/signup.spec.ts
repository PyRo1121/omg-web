import { expect, test } from '@playwright/test';

test.describe('OAuth-only signup surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  });

  test('renders both verified identity providers', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expect(page.getByText('Use a verified identity provider to get started.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  test('does not expose password registration controls', async ({ page }) => {
    await expect(page.getByLabel('Email Address')).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0);
    await expect(page.getByText(/email\/password registration is disabled/i)).toBeVisible();
  });
});
