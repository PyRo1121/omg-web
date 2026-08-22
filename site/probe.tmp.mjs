import { chromium } from '@playwright/test';

const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded' });
console.log('goto done');

// fill
const t = async (name, v) => { const loc = page.getByRole('textbox', { name }); await loc.waitFor({ timeout: 30000 }); await loc.fill(v); };
await t('John Doe', 'E2E User');
await t('dev@example.com', 'e2e@example.com');
await t('At least 8 characters', 'correct-horse-battery');
await t('Confirm your password', 'different-value');
console.log('filled');

await page.getByRole('button', { name: 'Create Account' }).click();
console.log('clicked at', new Date().toISOString());

for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const err = await page.getByText('Passwords do not match').count();
  console.log(`t+${(i + 1) * 5}s errCount=${err} url=${page.url()}`);
  if (err > 0) break;
}
await browser.close();
