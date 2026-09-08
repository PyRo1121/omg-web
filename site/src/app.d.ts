import type { WebsiteEnv } from '../alchemy.run';

declare global {
  namespace App {
    interface Platform {
      env: WebsiteEnv;
    }
  }
}
