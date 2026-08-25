import { sitemapResponse } from '../../lib/server/public-files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => sitemapResponse();
