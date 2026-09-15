import { error } from '@sveltejs/kit';
import { loadLearningPage } from '../../../../lib/learn/content.server';
import { learningMarkdown } from '../../../../lib/learn/markdown';
import type { RequestHandler } from './$types';

// The adapter discards custom headers on prerendered text endpoints. Keep the
// handler so production preserves Markdown MIME type and noindex policy.
export const prerender = false;

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
