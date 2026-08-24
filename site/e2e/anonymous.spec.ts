import { expect, test } from '@playwright/test';
import { AUTH_FIELDS, suppressNativeFormSubmission } from './helpers';

test.describe('anonymous authorization', () => {
  test('redirects the admin surface to login', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('redirects the account dashboard to login', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByRole('button', { name: AUTH_FIELDS.signInButton })).toBeVisible();
  });

  test('opens the introductory offer only from pricing intent', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(async () => {
      await page.getByRole('button', { name: 'Get a private code' }).click();
      await expect(
        page.getByRole('heading', { name: 'Take 20% off your first three months.' })
      ).toBeVisible();
    }).toPass();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create my code' })).toBeVisible();
  });

  test('renders the complete login entry surface', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel(AUTH_FIELDS.emailLabel)).toBeVisible();
    await expect(page.getByLabel(AUTH_FIELDS.passwordLabel)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  test('rejects invalid credentials with an error and without navigating away', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const signIn = page.getByRole('button', { name: AUTH_FIELDS.signInButton });
    // Same hydration-tolerant unit as the signup mismatch check: re-apply the
    // submission guard and refill on every pass so a pre-hydration click can
    // neither leak the fields into a native GET nor wedge the retry loop.
    await expect(async () => {
      await suppressNativeFormSubmission(page);
      await page.getByLabel(AUTH_FIELDS.emailLabel).fill('e2e-invalid@example.com');
      await page.getByLabel(AUTH_FIELDS.passwordLabel).fill('definitely-not-the-password');
      await signIn.click();
      // Better Auth's generic invalid-credential copy (or the client's
      // "Login failed" fallback) must appear; no account-existence hint.
      await expect(page.getByText(/invalid email or password|login failed/i)).toBeVisible();
    }).toPass();
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});
