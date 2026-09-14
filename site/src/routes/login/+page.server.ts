import { loadAuthEntry } from '../../lib/server/auth.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = loadAuthEntry;
