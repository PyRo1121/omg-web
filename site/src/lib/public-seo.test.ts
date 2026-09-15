import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Updates from '../routes/updates/+page.svelte';
import { sitemapResponse } from './server/public-files';

describe('public discovery contracts', () => {
  it('gives release links a complete social preview on the canonical origin', () => {
    const { head } = render(Updates);
    expect(head).toContain(
      'property="og:image" content="https://getomg.xyz/og/omg-discovery-2026.png"'
    );
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    expect(head.match(/rel="canonical"/gu)).toHaveLength(1);
    expect(head).toContain('href="https://getomg.xyz/updates/"');
  });

  it('makes authored runtime and workflow pages discoverable with truthful dates', async () => {
    const xml = await sitemapResponse().text();
    expect(xml).toContain('<loc>https://getomg.xyz/runtimes/node/</loc>');
    expect(xml).toContain('<loc>https://getomg.xyz/guides/node-npm-pnpm/</loc>');
    expect(xml).toContain('<loc>https://getomg.xyz/compare/omg-vs-mise/</loc>');
    expect(xml).toContain('<lastmod>2026-09-14</lastmod>');
    expect(xml).not.toContain('/dashboard/');
    expect(xml).not.toContain('/api/');
  });
});
