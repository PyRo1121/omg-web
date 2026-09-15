import { error } from '@sveltejs/kit';
import { LEARNING_PAGES } from '../../../../lib/learn/catalog';
import { loadLearningPage } from '../../../../lib/learn/content.server';
import { learningMarkdown } from '../../../../lib/learn/markdown';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;
export const entries: EntryGenerator = () =>
  LEARNING_PAGES.map(({ category, slug }) => ({ category, slug }));

export const GET: RequestHandler = async ({ params }) => {
  const page = await loadLearningPage(params.category, params.slug);
  if (!page) error(404, 'Guide not found');
  return new Response(learningMarkdown(page.meta, page.content), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex',
      'Content-Signal': 'search=yes, ai-train=no',
    },
  });
};
