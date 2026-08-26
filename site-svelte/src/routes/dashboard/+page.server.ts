import { redirect } from '@sveltejs/kit';
import { getRequestSession } from '../../lib/server/auth.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async event => {
  const session = await getRequestSession(event);
  if (session === null) {
    redirect(302, '/login/');
  }

  return session;
};
