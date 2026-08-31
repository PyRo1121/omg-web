import { expect, test } from '@playwright/test';
import { AUTH_FIELDS } from './helpers';

const externalBaseUrl = process.env['E2E_BASE_URL']?.trim();

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Svelte public surfaces', () => {
  test('keeps the complete pricing surface reachable on a compact viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Stop managing package managers.' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The core stays free.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Pro' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Team' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create offer' })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);
  });

  test('renders a bounded checkout verification state on a compact viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?success=true&session_id=invalid', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'We could not verify this checkout.' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login/');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);
  });

  test('renders the documentation entry surface and public sitemap', async ({ page }) => {
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

  test('renders legal pages and the crawler policy', async ({ page }) => {
    const privacyResponse = await page.goto('/privacy/', { waitUntil: 'domcontentloaded' });
    expect(privacyResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Data retention' })).toBeVisible();

    const termsResponse = await page.goto('/terms/', { waitUntil: 'domcontentloaded' });
    expect(termsResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Terms of service' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Acceptable use' })).toBeVisible();

    const robotsResponse = await page.request.get('/robots.txt');
    expect(robotsResponse.ok()).toBe(true);
    const robots = await robotsResponse.text();
    expect(robots).toContain('Disallow: /dashboard');
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Sitemap: https://omg.latham.cloud/sitemap.xml');
  });
});

test.describe('deployed Svelte authorization surfaces', () => {
  test.skip(externalBaseUrl === undefined, 'E2E_BASE_URL is required for bound authentication');

  test('redirects protected account and admin pages to login', async ({ page }) => {
    await page.goto('/dashboard/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\/?$/);

    await page.goto('/admin/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByRole('heading', { name: 'Pick up where you left off.' })).toBeVisible();
  });

  test('renders the complete login entry surface', async ({ page }) => {
    await page.goto('/login/', { waitUntil: 'networkidle' });

    await expect(page.getByLabel(AUTH_FIELDS.emailLabel)).toBeVisible();
    await expect(page.getByLabel(AUTH_FIELDS.passwordLabel)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup/');
  });

  test('rejects invalid credentials without revealing account existence', async ({ page }) => {
    await page.goto('/login/', { waitUntil: 'networkidle' });
    await page.getByLabel(AUTH_FIELDS.emailLabel).fill('e2e-invalid@example.com');
    await page.getByLabel(AUTH_FIELDS.passwordLabel).fill('definitely-not-the-password');
    await page.getByRole('button', { name: AUTH_FIELDS.signInButton }).click();

    await expect(page.getByText(/invalid email or password|login failed/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});
