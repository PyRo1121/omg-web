import { expect, type Page } from '@playwright/test';

export const AUTH_FIELDS = {
  emailLabel: 'Email address',
  passwordLabel: 'Password',
  signInButton: 'Sign in',
} as const;

export const DASHBOARD_URL_PATTERN = /\/dashboard\/?$/;
export const DASHBOARD_HEADING = 'Account overview.';

/** Drive the Svelte login surface and require the protected account page to render. */
export async function performUiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login/', { waitUntil: 'networkidle' });
  await page.getByLabel(AUTH_FIELDS.emailLabel).fill(email);
  await page.getByLabel(AUTH_FIELDS.passwordLabel).fill(password);
  await page.getByRole('button', { name: AUTH_FIELDS.signInButton }).click();
  await expect(page).toHaveURL(DASHBOARD_URL_PATTERN);
  await expect(page.getByRole('heading', { name: DASHBOARD_HEADING })).toBeVisible();
}
