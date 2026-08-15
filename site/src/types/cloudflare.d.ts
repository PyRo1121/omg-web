import type { H3EventContext } from 'h3';
import type { CloudflareEnv } from '../lib/auth';

declare module 'h3' {
  interface H3EventContext {
    cloudflare?: {
      env?: CloudflareEnv;
    };
  }
}

export type CloudflareContext = Pick<H3EventContext, 'cloudflare'>;
