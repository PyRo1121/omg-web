import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    poolOptions: {
      workers: {
        remoteBindings: false,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Use in-memory D1 databases for testing
          d1Databases: ['DB', 'ANALYTICS_DB'],
        },
      },
    },
  },
});
