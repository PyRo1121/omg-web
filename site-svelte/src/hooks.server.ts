import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { createShadowAuth } from './lib/server/auth.server';
import { withSiteHeaders } from './lib/server/public-files';

const AUTH_PATH_PREFIX = '/api/auth/';

export const handle: Handle = async ({ event, resolve }) => {
  const platform = event.platform;
  let response: Response;

  if (building) {
    response = await resolve(event);
  } else if (platform === undefined) {
    response = event.url.pathname.startsWith(AUTH_PATH_PREFIX)
      ? Response.json({ error: 'Authentication service unavailable' }, { status: 503 })
      : await resolve(event);
  } else {
    const auth = createShadowAuth(platform.env, event.url);
    response = await svelteKitHandler({ event, resolve, auth, building });
  }

  return withSiteHeaders(response, platform?.env.DEPLOYMENT_STAGE);
};
