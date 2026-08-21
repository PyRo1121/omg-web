import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.test.toml' },
      remoteBindings: false,
      miniflare: {
        d1Databases: ['DB'],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./migrations', import.meta.url))
          ),
        },
      },
    })),
  ],
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
