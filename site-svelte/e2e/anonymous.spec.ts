import { expect, test } from '@playwright/test';
import { AUTH_FIELDS } from './helpers';

const externalBaseUrl = process.env['E2E_BASE_URL']?.trim();

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Svelte public surfaces', () => {
  test('publishes canonical crawl and sharing metadata', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle('OMG: One CLI for Packages, Runtimes, and Project Toolchains');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://omg.latham.cloud/'
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow, max-image-preview:large'
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://omg.latham.cloud/og/omg-og.png'
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');

    const structuredDataText = await page
      .locator('script[type="application/ld+json"]')
      .evaluate(node => node.textContent ?? '');
    expect(structuredDataText).toContain('https://omg.latham.cloud/install.sh');
    expect(() => JSON.parse(structuredDataText)).not.toThrow();

    const socialImage = await page.request.get('/og/omg-og.png');
    expect(socialImage.ok()).toBe(true);
    expect(socialImage.headers()['content-type']).toBe('image/png');
  });

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
    await expect(
      page.getByRole('heading', { name: 'Manage Node.js, Python, Go, and Rust versions' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Capture reproducible project environments' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /CLI reference/ })).toHaveAttribute(
      'href',
      /github\.com\/PyRo1121\/omg\/blob\/main\/docs\/cli\.md/
    );

    const sitemap = await page.request.get('/sitemap.xml');
    const sitemapText = await sitemap.text();
    expect(sitemap.ok()).toBe(true);
    expect(sitemapText).toContain('<loc>https://omg.latham.cloud/docs/</loc>');
    expect(sitemapText).not.toContain('<lastmod>');
    expect(sitemapText).not.toContain('<changefreq>');
    expect(sitemapText).not.toContain('<priority>');
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

  test('emits one anonymous analytics batch without a browser privacy signal', async ({ page }) => {
    let analyticsRequests = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/analytics/site/') {
        analyticsRequests += 1;
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page
      .getByRole('navigation', { name: 'Homepage introduction' })
      .getByRole('link', { name: 'Install OMG', exact: true })
      .click();
    await page.waitForTimeout(3_500);

    expect(analyticsRequests).toBeGreaterThan(0);
  });

  for (const preference of ['globalPrivacyControl', 'doNotTrack'] as const) {
    test(`honors ${preference} before analytics begins`, async ({ page }) => {
      let analyticsRequests = 0;
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/analytics/site/') {
          analyticsRequests += 1;
        }
      });
      await page.addInitScript(
        ({ key, value }) => {
          Object.defineProperty(globalThis.navigator, key, { configurable: true, value });
        },
        { key: preference, value: preference === 'globalPrivacyControl' ? true : '1' }
      );

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await page
        .getByRole('navigation', { name: 'Homepage introduction' })
        .getByRole('link', { name: 'Install OMG', exact: true })
        .click();
      await page.waitForTimeout(3_500);

      expect(analyticsRequests).toBe(0);
    });
  }

  test('renders legal pages and the crawler policy', async ({ page }) => {
    const privacyResponse = await page.goto('/privacy/', { waitUntil: 'domcontentloaded' });
    expect(privacyResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Data retention' })).toBeVisible();
    await expect(page.getByText('Version 2.1 / Last updated September 1, 2026')).toBeVisible();
    await expect(page.getByText('Website analytics:', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Global Privacy Control and browser Do Not Track prevent public analytics')
    ).toBeVisible();
    await expect(page.getByText('request a portable copy from support')).toBeVisible();
    await expect(
      page.getByText('export your data as JSON from the dashboard settings')
    ).toHaveCount(0);
    await expect(page.getByText('POST /api/privacy/')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://omg.latham.cloud/privacy/'
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Privacy Policy - OMG Package Manager'
    );

    const termsResponse = await page.goto('/terms/', { waitUntil: 'domcontentloaded' });
    expect(termsResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Terms of service' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Acceptable use' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://omg.latham.cloud/terms/'
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Terms of Service - OMG Package Manager'
    );

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
