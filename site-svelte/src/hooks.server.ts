import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { createShadowAuth, enforceAuthMutationRateLimit } from './lib/server/auth.server';
import { withDocsRouteCache, withSiteHeaders } from './lib/server/public-files';

const AUTH_PATH_PREFIX = '/api/auth/';
const ORGANIZATION_PLUGIN_PATH_PREFIX = '/api/auth/organization/';
const AUTH_UNAVAILABLE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const PRIVATE_ORGANIZATION_ROUTE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export const handle: Handle = async ({ event, resolve }) => {
  const platform = event.platform;
  const isAuthPath = event.url.pathname.startsWith(AUTH_PATH_PREFIX);
  let response: Response;

  if (building) {
    response = await resolve(event);
  } else if (platform === undefined) {
    response = isAuthPath
      ? Response.json(
          { error: 'Authentication service unavailable' },
          { headers: AUTH_UNAVAILABLE_HEADERS, status: 503 }
        )
      : await resolve(event);
  } else if (event.url.pathname.startsWith(ORGANIZATION_PLUGIN_PATH_PREFIX)) {
    response = Response.json(
      { error: 'Not found' },
      {
        headers: PRIVATE_ORGANIZATION_ROUTE_HEADERS,
        status: 404,
      }
    );
  } else if (isAuthPath) {
    const rateLimitResponse = await enforceAuthMutationRateLimit(
      event.request,
      platform.env.AUTH_RATE_LIMITER
    );
    if (rateLimitResponse !== null) {
      response = rateLimitResponse;
    } else {
      const auth = createShadowAuth(platform.env, event.url);
      response = await svelteKitHandler({ event, resolve, auth, building });
    }
  } else {
    response = await resolve(event);
  }

  const securedResponse = withSiteHeaders(response, platform?.env.DEPLOYMENT_STAGE);
  return withDocsRouteCache(securedResponse, event.request.method, event.url.pathname);
};
