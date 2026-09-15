import { expect, test } from '@playwright/test';

test('preserves a mobile menu opened before hydration', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const scripts = Promise.withResolvers<void>();
  await page.route('**/*', async route => {
    if (route.request().resourceType() === 'script') await scripts.promise;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  const menu = page.locator('.mobile-menu');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  scripts.resolve();
  await page.waitForLoadState('networkidle');
  await expect(menu).toHaveAttribute('open', '');
  await menu.getByRole('link', { name: 'Runtimes', exact: true }).click();
  await expect(page).toHaveURL(/\/runtimes\/$/);
});

test('mobile navigation reaches a runtime guide and updates canonical metadata', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByText('Menu', { exact: true }).click();
  const menu = page.locator('.mobile-menu');
  await expect(menu.getByRole('link', { name: 'Docs', exact: true })).toBeVisible();
  await menu.getByRole('link', { name: 'Runtimes', exact: true }).click();
  await expect(page).toHaveURL(/\/runtimes\/$/);
  await page.getByRole('link', { name: /Manage Node.js versions with OMG/ }).click();
  await expect(page).toHaveURL(/\/runtimes\/node\/$/);
  await expect(page.locator('h1')).toHaveText('Manage Node.js versions with OMG');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://getomg.xyz/runtimes/node/'
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    'https://getomg.xyz/runtimes/node/'
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('node-mobile.png') });
  await page
    .getByRole('link', { name: 'Use Node.js, npm, and pnpm with OMG', exact: true })
    .click();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://getomg.xyz/guides/node-npm-pnpm/'
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Use Node.js, npm, and pnpm with OMG - OMG'
  );
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 568 } });
  test('keeps the menu keyboard-operable and the guide readable', async ({ page }) => {
    await page.goto('/');
    const menu = page.locator('.mobile-menu');
    await menu.locator('summary').focus();
    await menu.locator('summary').press('Enter');
    await expect(menu.getByRole('link', { name: 'Runtimes', exact: true })).toBeVisible();
    await menu.getByRole('link', { name: 'Runtimes', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('link', { name: /Manage Node.js versions with OMG/ }).click();
    await expect(page.locator('h1')).toHaveText('Manage Node.js versions with OMG');
    await expect(page.getByText('omg use node lts', { exact: false }).first()).toBeVisible();
  });
});

test('public sitemap, raw HTML and Markdown agree on published guides', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>https:\/\/getomg\.xyz([^<]*)<\/loc>/g)].map(
    match => match[1]!
  );
  expect(urls).toContain('/runtimes/node/');
  expect(urls).toContain('/compare/omg-vs-mise/');
  for (const path of urls.filter(candidate => /^\/(runtimes|guides|compare)\//.test(candidate))) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html.match(/<h1\b/g), path).toHaveLength(1);
    expect(html.match(/rel="canonical"/g), path).toHaveLength(1);
    expect(html, path).toContain(`href="https://getomg.xyz${path}"`);
    expect(html, path).toContain('name="twitter:card"');
    expect(html, path).not.toContain('content="noindex');
  }
  const markdown = await request.get('/markdown/runtimes/node/');
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()['content-type']).toContain('text/markdown');
  expect(await markdown.text()).toContain('omg use node lts');
  expect(markdown.headers()['x-robots-tag']).toContain('noindex');
  expect(markdown.headers()['content-signal']).toContain('ai-train=no');
  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  expect(llms.headers()['content-type']).toContain('text/plain');
  expect(llms.headers()['x-robots-tag']).toContain('noindex');
  expect(await llms.text()).toContain('/markdown/runtimes/node/');
  const missing = await request.get('/runtimes/not-a-runtime/');
  expect(missing.status()).toBe(404);
  expect((await request.get('/guides/node/')).status()).toBe(404);
});
