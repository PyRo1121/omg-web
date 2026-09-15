import { LEARNING_CATEGORIES, LEARNING_PAGES } from '../../lib/learn/catalog';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;
export const entries: EntryGenerator = () =>
  Array.from(new Set(LEARNING_PAGES.map(page => page.category)), category => ({ category }));

export const load: PageServerLoad = ({ params }) => {
  const category = params.category;
  const metadata = LEARNING_CATEGORIES[category];
  return {
    category,
    ...metadata,
    pages: LEARNING_PAGES.filter(page => page.category === category),
  };
};
