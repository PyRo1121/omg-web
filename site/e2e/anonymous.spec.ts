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
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);

    await expect(async () => {
      await page.getByRole('button', { name: 'Get a private code' }).click();
      await expect(
        page.getByRole('heading', { name: 'Take 20% off your first three months.' })
      ).toBeVisible();
    }).toPass();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create my code' })).toBeVisible();
    const dialogBounds = await page.getByRole('dialog').boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds?.y).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(568);
  });

  test('keeps plan selection reachable on a compact viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const dialog = page.getByRole('dialog');
    await expect(async () => {
      await page.getByRole('button', { name: 'Choose Pro' }).click();
      await expect(dialog.getByRole('heading', { name: 'Choose a plan' })).toBeVisible();
    }).toPass();
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds?.y).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(568);
    expect(await dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(
      true
    );
  });

  test('keeps purchase status reachable on a compact viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?success=true&session_id=invalid', { waitUntil: 'domcontentloaded' });

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Purchase status' })).toBeVisible();
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds?.y).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(568);
  });

  test('renders the documentation entry surface', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/docs/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Learn the parts you need.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Install OMG' })).toBeVisible();
    await expect(page.getByRole('link', { name: /CLI reference/ })).toHaveAttribute(
      'href',
      /github\.com\/PyRo1121\/omg\/blob\/main\/docs\/cli\.md/
    );

    const sitemap = await page.request.get('/sitemap.xml');
    const sitemapText = await sitemap.text();
    expect(sitemap.ok()).toBe(true);
    expect(sitemapText).toContain('<loc>https://omg.latham.cloud/docs/</loc>');
    expect(sitemapText).toContain('<lastmod>');
    expect(sitemapText).not.toContain('https://omg.latham.cloud/dashboard');
    expect(sitemapText).not.toContain('/docs/getting-started');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);
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
