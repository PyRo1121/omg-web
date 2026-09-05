import { expect, test } from '@playwright/test';
import { Schema } from 'effect';
import { SITE_ORIGIN } from '../../shared/public-site';
import { AUTH_FIELDS } from './helpers';

const BreadcrumbListSchema = Schema.Struct({
  '@type': Schema.String,
  itemListElement: Schema.Array(Schema.Struct({ name: Schema.String, position: Schema.Number })),
});
const decodeBreadcrumbList = Schema.decodeUnknownSync(Schema.fromJsonString(BreadcrumbListSchema));
const externalBaseUrl = process.env['E2E_BASE_URL']?.trim();

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Svelte public surfaces', () => {
  test('copies the complete installer command without the shell prompt', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/#install', { waitUntil: 'networkidle' });
    const linuxCopy = page.getByRole('button', { name: 'Copy Linux / macOS command', exact: true });
    await linuxCopy.focus();
    await linuxCopy.press('Enter');
    await expect(page.getByRole('status', { name: 'Linux / macOS', exact: true })).toHaveText(
      'Linux / macOS command copied.'
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `curl -fsSL ${SITE_ORIGIN}/install.sh -o omg-install.sh\nless omg-install.sh && bash omg-install.sh`
    );
    await page.getByRole('button', { name: 'Copy Arch / AUR command', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Arch / AUR', exact: true })).toHaveText(
      'Arch / AUR command copied.'
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('yay -S omg-bin');
  });

  for (const failure of ['unavailable', 'denied'] as const) {
    test(`keeps installation commands available when the clipboard is ${failure}`, async ({
      page,
    }) => {
      await page.addInitScript(mode => {
        Object.defineProperty(navigator, 'clipboard', {
          value:
            mode === 'unavailable'
              ? undefined
              : {
                  writeText: () =>
                    Promise.reject(new DOMException('Clipboard denied', 'NotAllowedError')),
                },
          configurable: true,
        });
      }, failure);
      await page.goto('/#install', { waitUntil: 'networkidle' });
      const copy = page.getByRole('button', { name: 'Copy Linux / macOS command', exact: true });
      await copy.click();
      await expect(page.getByRole('status', { name: 'Linux / macOS', exact: true })).toHaveText(
        'Could not copy. Select and copy the Linux / macOS command above.'
      );
      await expect(page.locator('#install code').first()).toContainText('less omg-install.sh');
      await expect(copy).toBeEnabled();
    });
  }

  test('publishes canonical crawl and sharing metadata', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle('OMG: One CLI for Packages, Runtimes, and Project Toolchains');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_ORIGIN}/`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow, max-image-preview:large'
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `${SITE_ORIGIN}/og/omg-og.png`
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');

    const structuredDataText = await page
      .locator('script[type="application/ld+json"]')
      .evaluate(node => node.textContent ?? '');
    expect(structuredDataText).toContain(`${SITE_ORIGIN}/install.sh`);
    expect(() => JSON.parse(structuredDataText)).not.toThrow();

    const socialImage = await page.request.get('/og/omg-og.png');
    expect(socialImage.ok()).toBe(true);
    expect(socialImage.headers()['content-type']).toBe('image/png');
  });

  test('keeps the complete home surface reachable on a compact viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Stop managing package managers.' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'One interface. Three jobs.' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Install once. Start simplifying.' })
    ).toBeVisible();
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
    for (const topicSlug of [
      'installation',
      'cli',
      'configuration',
      'runtimes',
      'workflows',
      'security',
      'troubleshooting',
      'architecture',
    ]) {
      await expect(page.locator(`a[href="/docs/${topicSlug}/"]`).first()).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /CLI reference/ })).toHaveAttribute(
      'href',
      '/docs/cli/'
    );
    await expect(
      page.getByText('cargo install omg --git https://github.com/PyRo1121/omg --locked', {
        exact: true,
      })
    ).toBeVisible();

    const sitemap = await page.request.get('/sitemap.xml');
    const sitemapText = await sitemap.text();
    expect(sitemap.ok()).toBe(true);
    expect(sitemapText).toContain(`<loc>${SITE_ORIGIN}/docs/</loc>`);
    for (const topicSlug of ['installation', 'cli', 'architecture']) {
      expect(sitemapText).toContain(`<loc>${SITE_ORIGIN}/docs/${topicSlug}/</loc>`);
    }
    expect(sitemapText).not.toContain('<lastmod>');
    expect(sitemapText).not.toContain('<changefreq>');
    expect(sitemapText).not.toContain('<priority>');
    expect(sitemapText).not.toContain(`${SITE_ORIGIN}/dashboard`);
    expect(sitemapText).not.toContain('/docs/getting-started');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);
  });

  test('renders the native CLI reference topic with valid provenance metadata', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/docs/cli/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'CLI reference', level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/docs/cli/`
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'CLI reference - OMG Package Manager'
    );
    await expect(
      page.getByRole('navigation', { name: 'Documentation topics' }).locator('a[href="/docs/cli/"]')
    ).toHaveAttribute('aria-current', 'page');

    const breadcrumbText = await page
      .locator('script[type="application/ld+json"]')
      .evaluate(node => node.textContent ?? '');
    const breadcrumb = decodeBreadcrumbList(breadcrumbText);
    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement.map(item => item.name)).toEqual([
      'Home',
      'Docs',
      'CLI reference',
    ]);

    await expect(page.getByRole('link', { name: /PyRo1121\/omg\/docs\/cli\.md/ })).toHaveAttribute(
      'href',
      'https://github.com/PyRo1121/omg/blob/2bb910395ed5f7bd1a40cbf431fde032e876140e/docs/cli.md'
    );

    await page
      .getByRole('navigation', { name: 'Documentation topics' })
      .getByRole('link', { name: 'Installation' })
      .click();
    await expect(page).toHaveURL(/\/docs\/installation\/?$/);
    await expect(page.getByRole('heading', { name: 'Installing OMG', level: 1 })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Rosetta 2');
    await expect(page.getByText('omg completions zsh', { exact: true })).toBeVisible();

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

  test('recovers from a missing page through clear same-site links', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    const recovery = page.getByRole('navigation', { name: 'Recovery links' });
    await expect(recovery.getByRole('link', { name: 'Back to home', exact: true })).toHaveAttribute(
      'href',
      '/'
    );
    await recovery.getByRole('link', { name: 'Read the docs', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/$/);
    await expect(page.getByRole('heading', { name: 'Learn the parts you need.' })).toBeVisible();
  });

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
      `${SITE_ORIGIN}/privacy/`
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
      `${SITE_ORIGIN}/terms/`
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
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
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
