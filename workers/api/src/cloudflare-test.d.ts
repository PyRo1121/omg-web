declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'cloudflare:test' {
  import type { D1Migration } from '@cloudflare/vitest-plugin';
  import type { Env } from './api';

  export const env: Env & { TEST_MIGRATIONS: D1Migration[] };
  export const SELF: Fetcher;
  export function applyD1Migrations(
    db: D1Database,
    migrations: D1Migration[],
    migrationsTableName?: string
  ): Promise<void>;
  export function createExecutionContext(): ExecutionContext;
  export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
}
