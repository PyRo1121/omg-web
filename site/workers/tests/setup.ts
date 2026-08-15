import '../src/cloudflare-test.d.ts';
import { beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import schemaSql from './setup.sql?raw';

beforeAll(async () => {
  const statements = schemaSql
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
});
