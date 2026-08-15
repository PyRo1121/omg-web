declare module 'cloudflare:test' {
  import type { Env } from './api';

  export const env: Env;
  export const SELF: Fetcher;
  export function createExecutionContext(): ExecutionContext;
  export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
}
