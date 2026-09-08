import { Schema } from 'effect';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DocsTopicPage from './DocsTopicPage.svelte';
import { cliTopic } from '../../docs/content/cli';
import { installationTopic } from '../../docs/content/installation';
import { docsSourceHref } from '../../docs/topics';

const BreadcrumbListSchema = Schema.Struct({
  '@type': Schema.String,
  itemListElement: Schema.Array(Schema.Struct({ name: Schema.String, position: Schema.Number })),
});
const decodeBreadcrumbList = Schema.decodeUnknownSync(Schema.fromJsonString(BreadcrumbListSchema));

describe('docs topic page renderer', () => {
  const rendered = render(DocsTopicPage, { props: { topic: cliTopic } });

  it('renders one h1 and the sidebar with the active topic marked', () => {
    const h1Count = (rendered.body.match(/<h1/g) ?? []).length;
    expect(h1Count).toBe(1);
    expect(rendered.body).toContain('CLI reference');
    expect(rendered.body).toContain('href="/docs/cli/" aria-current="page"');
    expect(rendered.body).toContain('href="/docs/installation/"');
    expect(rendered.body).not.toContain('href="/docs/cli/" aria-current="off"');
  });

  it('renders semantic breadcrumbs, sections, and tables', () => {
    expect(rendered.body).toContain('aria-label="Breadcrumb"');
    expect(rendered.body).toContain('href="/docs/"');
    expect(rendered.body).toContain('id="packages"');
    const tableHeading = /<h3 id="([^"]+)"[^>]*>Package command reference<\/h3>/u.exec(
      rendered.body
    );
    expect(tableHeading).not.toBeNull();
    expect(rendered.body).toContain(
      `role="region" aria-labelledby="${tableHeading?.[1]}" tabindex="0"`
    );
    expect(rendered.body).not.toContain('<caption');
    expect(rendered.body).toContain('<th scope="col"');
  });

  it('escapes block content instead of injecting markup', () => {
    expect(rendered.body).not.toContain('{@html');
    const tableCell = rendered.body.indexOf('omg search');
    expect(tableCell).toBeGreaterThan(-1);
  });

  it('emits canonical, sharing, and provenance metadata', () => {
    expect(rendered.head).toContain('<link rel="canonical" href="https://getomg.xyz/docs/cli/"');
    expect(rendered.head).toContain('property="og:title"');
    expect(rendered.head).toContain('name="twitter:card"');
    expect(rendered.head).toContain(
      '<meta name="description" content="Every OMG command for packages, runtimes, audits, environments, and maintenance, with the options that matter day to day."'
    );
    expect(rendered.body).toContain(
      `href="${docsSourceHref(cliTopic.source)}" target="_blank" rel="noopener noreferrer"`
    );
  });

  it('keeps structured and visible breadcrumb labels aligned', () => {
    const installationPage = render(DocsTopicPage, { props: { topic: installationTopic } });
    const match = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/u.exec(
      installationPage.head
    );
    const parsed = decodeBreadcrumbList(match?.[1] ?? 'null');

    expect(parsed.itemListElement.at(-1)?.name).toBe('Installation');
    expect(installationPage.body).toMatch(/<span aria-current="page"[^>]*>Installation<\/span>/u);
  });

  it('serializes parseable BreadcrumbList JSON-LD with three levels', () => {
    const match = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/u.exec(
      rendered.head
    );
    expect(match).not.toBeNull();
    const parsed = decodeBreadcrumbList(match?.[1] ?? 'null');
    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(parsed.itemListElement.map(item => item.name)).toEqual([
      'Home',
      'Docs',
      'CLI reference',
    ]);
    expect(parsed.itemListElement.at(-1)?.position).toBe(3);
  });
});
