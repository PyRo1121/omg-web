import * as Schema from 'effect/Schema';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { performUiLogin } from './helpers';

const baseUrl = process.env['E2E_BASE_URL']?.trim();
const userEmail = process.env['E2E_USER_EMAIL']?.trim();
const userPassword = process.env['E2E_USER_PASSWORD']?.trim();
const adminEmail = process.env['E2E_ADMIN_EMAIL']?.trim();
const adminPassword = process.env['E2E_ADMIN_PASSWORD']?.trim();
const allowMutations = process.env['E2E_ALLOW_MUTATIONS'] === 'true';

/** Header row minted by the workers admin users CSV export. */
const USERS_EXPORT_CSV_HEADER =
  'id,email,company,created_at,tier,status,active_machines,total_commands';

const CheckoutResponseSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.minLength(1)),
});

test.describe('staging authenticated user', () => {
  test.skip(
    baseUrl === undefined || userEmail === undefined || userPassword === undefined,
    'E2E_BASE_URL and non-admin staging credentials are required'
  );

  test('covers login, dashboard, authenticated BFF, non-admin authorization, and logout', async ({
    page,
  }) => {
    await performUiLogin(page, userEmail ?? '', userPassword ?? '');

    const dashboardResponse = await page.request.get('/api/licensing/api/dashboard');
    expect(dashboardResponse.status()).toBe(200);
    expect(dashboardResponse.headers()['content-type']).toContain('application/json');

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard$/);

    // The /admin -> /dashboard client redirect can update the URL before Solid
    // renders/hydrates the lazy dashboard and its click handlers; the header
    // Sign Out button stays disabled until hydration completes, so requiring
    // it to be enabled guarantees the click reaches a live handler.
    const signOutButton = page.getByRole('banner').getByRole('button', { name: 'Sign Out' });
    await expect(signOutButton).toBeEnabled();
    await signOutButton.click();
    // Sign-out intentionally returns to the marketing home page; anchor to the
    // exact origin root so a stray /login/ or /admin/ redirect cannot pass.
    await expect(page).toHaveURL(new URL('/', page.url()).href);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });

  test('creates a sandbox checkout session only when mutation tests are explicitly enabled', async ({
    page,
  }) => {
    test.skip(!allowMutations, 'Set E2E_ALLOW_MUTATIONS=true only for an isolated Stripe sandbox');
    await performUiLogin(page, userEmail ?? '', userPassword ?? '');

    // The BFF enforces same-origin on mutations; browsers always send Origin
    // on POST, so the characterization must too.
    const response = await page.request.post('/api/licensing/api/billing/checkout', {
      headers: { Origin: baseUrl ?? '' },
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
    await performUiLogin(page, adminEmail ?? '', adminPassword ?? '');
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('OMG Admin', { exact: true })).toBeVisible();

    // The Export button only toggles the download menu; the Users item inside
    // it triggers the actual download. Arm the listener before that click.
    await page.getByRole('button', { name: 'Export' }).click();
    // Anchored: matches the "Users" menu item, not a future stat or tab whose
    // name merely contains "Users".
    const usersMenuItem = page.getByRole('button', { name: /^Users\b/ });
    const downloadPromise = page.waitForEvent('download');
    await usersMenuItem.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^omg-users-\d{4}-\d{2}-\d{2}\.csv$/);

    // Filename alone proves nothing about payload shape; pin the header row
    // served by the workers export handler.
    const csv = await readFile(await download.path(), 'utf8');
    expect(csv.split('\n')[0]).toBe(USERS_EXPORT_CSV_HEADER);
  });
});
