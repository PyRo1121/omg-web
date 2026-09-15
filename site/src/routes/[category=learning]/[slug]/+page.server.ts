import { error } from '@sveltejs/kit';
import { LEARNING_PAGES } from '../../../lib/learn/catalog';
import { loadLearningPage } from '../../../lib/learn/content.server';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;
export const entries: EntryGenerator = () =>
  LEARNING_PAGES.map(({ category, slug }) => ({ category, slug }));

export const load: PageServerLoad = async ({ params }) => {
  const page = await loadLearningPage(params.category, params.slug);
  if (!page) error(404, 'Guide not found');
  return page;
};
