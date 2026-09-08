import { healthResponse } from '../../lib/server/public-files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => healthResponse();
