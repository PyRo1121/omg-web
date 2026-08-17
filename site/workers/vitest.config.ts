import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      remoteBindings: false,
      miniflare: {
        // Use in-memory D1 databases for testing
        d1Databases: ['DB', 'ANALYTICS_DB'],
      },
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
