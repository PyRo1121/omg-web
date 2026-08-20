import '../src/cloudflare-test.d.ts';
import { beforeAll } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
