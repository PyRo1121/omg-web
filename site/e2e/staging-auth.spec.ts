import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { performUiLogin } from './helpers';

const baseUrl = process.env['E2E_BASE_URL']?.trim();
const userEmail = process.env['E2E_USER_EMAIL']?.trim();
const userPassword = process.env['E2E_USER_PASSWORD']?.trim();
const adminEmail = process.env['E2E_ADMIN_EMAIL']?.trim();
const adminPassword = process.env['E2E_ADMIN_PASSWORD']?.trim();
const USERS_EXPORT_CSV_HEADER =
  'id,email,company,created_at,tier,status,active_machines,total_commands';

test.describe('deployed Svelte authenticated user', () => {
  test.skip(
    baseUrl === undefined || userEmail === undefined || userPassword === undefined,
    'E2E_BASE_URL and non-admin credentials are required'
  );

  test('covers login, account navigation, non-admin authorization, and logout', async ({
    page,
  }) => {
    await performUiLogin(page, userEmail ?? '', userPassword ?? '');

    await page
      .getByRole('navigation', { name: 'Account workspace' })
      .getByRole('link', {
        name: 'Analytics',
      })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/analytics\/?$/);
    await expect(page.getByRole('heading', { name: 'Account analytics.' })).toBeVisible();

    await page.goto('/admin/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard\/?$/);

    for (const path of ['/dashboard/', '/dashboard/settings/']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.route(
        '**/api/auth/sign-out*',
        route =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Service unavailable' }),
          }),
        { times: 1 }
      );
      const signOutButton = page.getByRole('button', { name: 'Sign out', exact: true });
      await signOutButton.click();
      await expect(page.getByRole('alert')).toHaveText('Could not sign out. Please try again.');
      await expect(page).toHaveURL(new URL(path, baseUrl).href);
      await expect(signOutButton).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(new URL('/', page.url()).href);

    await page.goto('/dashboard/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});

test.describe('deployed Svelte admin', () => {
  test.skip(
    baseUrl === undefined || adminEmail === undefined || adminPassword === undefined,
    'E2E_BASE_URL and admin credentials are required'
  );

  test('authorizes the operator workspace and downloads the bounded users export', async ({
    page,
  }) => {
    await performUiLogin(page, adminEmail ?? '', adminPassword ?? '');
    await page.goto('/admin/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole('heading', { name: 'Today at OMG' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Admin console' })
      .getByRole('link', {
        name: 'Audit',
      })
      .click();
    await expect(page).toHaveURL(/\/admin\/audit\/?$/);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Users CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('omg-users.csv');

    const csv = await readFile(await download.path(), 'utf8');
    expect(csv.split('\n')[0]).toBe(USERS_EXPORT_CSV_HEADER);
  });
});
