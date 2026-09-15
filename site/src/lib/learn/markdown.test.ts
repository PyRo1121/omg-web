import { describe, expect, it } from 'vitest';
import { learningMarkdown } from './markdown';
import { loadLearningPage } from './content.server';
import { LEARNING_PAGES } from './catalog';

describe('learning content boundaries', () => {
  it('rejects unknown pages and a slug under the wrong category', async () => {
    expect(await loadLearningPage('guides', 'node')).toBeUndefined();
    expect(await loadLearningPage('runtimes', '../node')).toBeUndefined();
    expect(await loadLearningPage('admin', 'node')).toBeUndefined();
  });

  it('exports the authored guide, code, and sources without dropping block types', async () => {
    const page = await loadLearningPage('guides', 'node-npm-pnpm');
    if (!page) throw new Error('Missing guide');
    const markdown = learningMarkdown(page.meta, page.content);
    expect(markdown).toContain('# Use Node.js, npm, and pnpm with OMG');
    expect(markdown).toContain('https://getomg.xyz/guides/node-npm-pnpm/');
    expect(markdown).toContain('```sh\nomg which node\nnode --version');
    expect(markdown).toContain('| Layer | Responsibility |');
    expect(markdown).toContain('pnpm install --frozen-lockfile');
    expect(markdown).toContain('[pnpm installation](https://pnpm.io/installation)');
    expect(markdown).toContain('https://getomg.xyz/docs/runtimes/');
  });

  it('loads every published page and emits each authored section', async () => {
    for (const meta of LEARNING_PAGES) {
      const page = await loadLearningPage(meta.category, meta.slug);
      if (!page) throw new Error(`Missing content: ${meta.slug}`);
      const markdown = learningMarkdown(meta, page.content);
      for (const section of page.content.sections) {
        expect(markdown).toContain(`## ${section.heading}`);
      }
      expect(page.content.sources.length).toBeGreaterThan(0);
    }
  });
});
