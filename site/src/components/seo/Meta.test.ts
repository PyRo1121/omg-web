import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  breadcrumbListSchema,
  buildFullTitle,
  createBreadcrumbsFromPath,
  createWebPageSchema,
  jsonLdContent,
  robotsContent,
} from './Meta';

const SITE_URL = 'https://omg.latham.cloud';

describe('buildFullTitle', () => {
  it('appends the site name to page titles', () => {
    expect(buildFullTitle('Pricing')).toBe(`Pricing | OMG Package Manager`);
  });

  it('keeps the bare site name unsuffixed', () => {
    expect(buildFullTitle('OMG Package Manager')).toBe('OMG Package Manager');
  });
});

describe('absoluteUrl', () => {
  it('resolves site-relative paths', () => {
    expect(absoluteUrl('/og/omg-og.png')).toBe(`${SITE_URL}/og/omg-og.png`);
  });

  it('passes absolute URLs through unchanged', () => {
    expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('returns undefined without input', () => {
    expect(absoluteUrl(undefined)).toBeUndefined();
  });
});

describe('robotsContent', () => {
  it('blocks indexing on request', () => {
    expect(robotsContent(true)).toBe('noindex, nofollow');
  });

  it('allows indexing by default', () => {
    expect(robotsContent(undefined)).toContain('index, follow');
    expect(robotsContent(false)).toContain('index, follow');
  });
});

describe('breadcrumbListSchema', () => {
  it('returns null without breadcrumbs', () => {
    expect(breadcrumbListSchema(undefined)).toBeNull();
    expect(breadcrumbListSchema([])).toBeNull();
  });

  it('numbers items from one and resolves relative urls', () => {
    const schema = breadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'Docs', url: '/docs' },
    ]);

    expect(schema).not.toBeNull();
    expect(schema?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE_URL}/docs` },
    ]);
  });
});

const JsonGraphSchema = Schema.Struct({
  '@context': Schema.String,
  '@graph': Schema.Array(Schema.Struct({ '@type': Schema.String })),
});

describe('jsonLdContent', () => {
  it('always includes the default graph nodes', () => {
    const graph = Schema.decodeUnknownSync(JsonGraphSchema)(JSON.parse(jsonLdContent({})));

    expect(graph['@context']).toBe('https://schema.org');
    expect(graph['@graph'].map(node => node['@type'])).toEqual([
      'Organization',
      'SoftwareApplication',
    ]);
  });

  it('appends breadcrumbs and custom nodes when provided', () => {
    const graph = Schema.decodeUnknownSync(JsonGraphSchema)(
      JSON.parse(
        jsonLdContent({
          breadcrumbs: [{ name: 'Home', url: '/' }],
          structuredData: [createWebPageSchema('Pricing', 'Plans', '/pricing')],
        })
      )
    );

    expect(graph['@graph'].map(node => node['@type'])).toEqual([
      'Organization',
      'SoftwareApplication',
      'BreadcrumbList',
      'WebPage',
    ]);
  });
});

describe('createWebPageSchema', () => {
  it('resolves relative page urls against the site origin', () => {
    const schema = createWebPageSchema('Pricing', 'Plans', '/pricing');
    expect(schema.url).toBe(`${SITE_URL}/pricing`);
  });
});

describe('createBreadcrumbsFromPath', () => {
  it('returns only Home for the root path', () => {
    expect(createBreadcrumbsFromPath('/')).toEqual([{ name: 'Home', url: '/' }]);
  });

  it('builds cumulative urls with title-cased labels', () => {
    expect(createBreadcrumbsFromPath('/docs/getting-started')).toEqual([
      { name: 'Home', url: '/' },
      { name: 'Docs', url: '/docs' },
      { name: 'Getting Started', url: '/docs/getting-started' },
    ]);
  });

  it('prefers custom labels over generated ones', () => {
    const crumbs = createBreadcrumbsFromPath('/docs/cli', { cli: 'CLI Reference' });
    expect(crumbs[2]).toEqual({ name: 'CLI Reference', url: '/docs/cli' });
  });
});
