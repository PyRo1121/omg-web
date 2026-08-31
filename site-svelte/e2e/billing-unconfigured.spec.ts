import { expect, test } from '@playwright/test';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Svelte checkout degradation', () => {
  test('surfaces a recoverable same-origin error when checkout is unavailable', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const originalOrigin = new URL(page.url()).origin;

    await page.getByRole('button', { name: 'Choose Pro' }).click();

    await expect(
      page.getByText(/Sign in before starting checkout|Checkout is temporarily unavailable/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Pro' })).toBeEnabled();
    expect(new URL(page.url()).origin).toBe(originalOrigin);
    expect(page.url()).not.toMatch(/^https:\/\/checkout\.stripe\.com/u);
  });
});
