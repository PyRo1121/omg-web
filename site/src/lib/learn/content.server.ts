import { LEARNING_PAGES } from './catalog';

const loaders = {
  node: () => import('./content/node'),
  bun: () => import('./content/bun'),
  python: () => import('./content/python'),
  'node-npm-pnpm': () => import('./content/node-npm-pnpm'),
  'migrate-from-nvm': () => import('./content/migrate-from-nvm'),
  'reproducible-dev-environments': () => import('./content/reproducible-dev-environments'),
  'omg-vs-mise': () => import('./content/omg-vs-mise'),
};

export async function loadLearningPage(category: string, slug: string) {
  const meta = LEARNING_PAGES.find(page => page.category === category && page.slug === slug);
  if (!meta) return undefined;
  const { content } = await loaders[meta.slug]();
  return { meta, content };
}
