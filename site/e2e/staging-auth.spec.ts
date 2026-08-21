import * as Schema from 'effect/Schema';
import { expect, test, type Page } from '@playwright/test';

const baseUrl = process.env['E2E_BASE_URL']?.trim();
const userEmail = process.env['E2E_USER_EMAIL']?.trim();
const userPassword = process.env['E2E_USER_PASSWORD'];
const adminEmail = process.env['E2E_ADMIN_EMAIL']?.trim();
const adminPassword = process.env['E2E_ADMIN_PASSWORD'];
const allowMutations = process.env['E2E_ALLOW_MUTATIONS'] === 'true';

const CheckoutResponseSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.minLength(1)),
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe('staging authenticated user', () => {
  test.skip(
    baseUrl === undefined || userEmail === undefined || userPassword === undefined,
    'E2E_BASE_URL and non-admin staging credentials are required'
  );

  test('covers login, dashboard, authenticated BFF, non-admin authorization, and logout', async ({
    page,
  }) => {
    await login(page, userEmail ?? '', userPassword ?? '');

    const dashboardResponse = await page.request.get('/api/licensing/api/dashboard');
    expect(dashboardResponse.status()).toBe(200);
    expect(dashboardResponse.headers()['content-type']).toContain('application/json');

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Sign Out' }).click();
    // Sign-out intentionally returns to the marketing home page.
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });

  test('creates a sandbox checkout session only when mutation tests are explicitly enabled', async ({
    page,
  }) => {
    test.skip(!allowMutations, 'Set E2E_ALLOW_MUTATIONS=true only for an isolated Stripe sandbox');
    await login(page, userEmail ?? '', userPassword ?? '');

    const response = await page.request.post('/api/licensing/api/billing/checkout', {
      data: { offer: 'pro' },
    });
    expect(response.status()).toBe(200);

    const payload: unknown = JSON.parse(await response.text());
    const decoded = Schema.decodeUnknownEither(CheckoutResponseSchema)(payload);
    expect(decoded._tag).toBe('Right');
    if (decoded._tag === 'Right') {
      const checkout = new URL(decoded.right.url);
      expect(checkout.protocol).toBe('https:');
      expect(checkout.hostname).toBe('checkout.stripe.com');
    }
  });
});

test.describe('staging admin', () => {
  test.skip(
    baseUrl === undefined || adminEmail === undefined || adminPassword === undefined,
    'E2E_BASE_URL and admin staging credentials are required'
  );

  test('authorizes the admin page and downloads the users export', async ({ page }) => {
    await login(page, adminEmail ?? '', adminPassword ?? '');
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('OMG Admin', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Export' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Users/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^users-.*\.csv$/);
  });
});
