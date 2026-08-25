import type { Handle } from '@sveltejs/kit';
import { withSiteHeaders } from './lib/server/public-files';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  return withSiteHeaders(response, event.platform?.env.DEPLOYMENT_STAGE);
};
