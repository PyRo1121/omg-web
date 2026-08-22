import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env['E2E_BASE_URL']?.trim();
const baseURL = externalBaseUrl ?? 'http://localhost:3000';
const localWebServer =
  externalBaseUrl === undefined
    ? {
        webServer: {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env['CI'],
          timeout: 180_000,
        },
      }
    : {};

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    // Local `vinxi dev` compiles routes lazily; first-hit assertions need more
    // headroom than the 5s Playwright default before state is observable.
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // --disable-dev-shm-usage keeps Chromium off /dev/shm, which exhausts and
      // crashes tabs on constrained local machines mid-run.
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-dev-shm-usage'] } },
    },
  ],
  ...localWebServer,
});
