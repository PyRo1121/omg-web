import { json } from '@sveltejs/kit';
import { securityFeed } from '../../../lib/server/security-updates.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) =>
  json(await securityFeed(fetch), {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  });
