import { createShadowAuth } from '../../lib/server/auth.server';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const platform = event.platform;
  if (platform === undefined) {
    error(503, 'Authentication service unavailable');
  }

  const auth = createShadowAuth(platform.env, event.url);
  const session = await auth.api.getSession({ headers: event.request.headers });

  if (session === null) {
    redirect(302, '/login/');
  }

  return {
    user: {
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
    },
    session: {
      expiresAt: session.session.expiresAt.toISOString(),
    },
  };
};
