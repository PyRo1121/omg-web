import { describe, expect, it } from 'vitest';
import type { DocsTopic } from './topic';
import { DOCS_TOPICS, docsSourceHref, docsTopicHref } from './topics';
import { architectureTopic } from './content/architecture';
import { cliTopic } from './content/cli';
import { configurationTopic } from './content/configuration';
import { installationTopic } from './content/installation';
import { runtimesTopic } from './content/runtimes';
import { securityTopic } from './content/security';
import { troubleshootingTopic } from './content/troubleshooting';
import { workflowsTopic } from './content/workflows';

const TOPICS: readonly DocsTopic[] = [
  installationTopic,
  cliTopic,
  configurationTopic,
  runtimesTopic,
  workflowsTopic,
  securityTopic,
  troubleshootingTopic,
  architectureTopic,
];

const REGISTRY_SLUGS = [
  'installation',
  'cli',
  'configuration',
  'runtimes',
  'workflows',
  'security',
  'troubleshooting',
  'architecture',
] as const;

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HEX_COMMIT = /^[0-9a-f]{7,40}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Fields whose strings are prose; angle brackets there would be markup smuggling. */
function proseStrings(topic: DocsTopic): string[] {
  const strings = [topic.title, topic.summary];
  for (const section of topic.sections) {
    strings.push(section.heading);
    for (const block of section.blocks) {
      if (block.kind === 'paragraphs') {
        strings.push(...block.paragraphs);
      } else if (block.kind === 'commands') {
        strings.push(block.title);
      } else if (block.kind === 'steps') {
        for (const step of block.steps) strings.push(step.text);
      } else if (block.kind === 'table') {
        strings.push(block.title, ...block.columns, ...block.rows.flat());
      } else if (block.kind === 'bullets') {
        strings.push(...block.items);
      } else {
        strings.push(block.text);
      }
    }
  }
  return strings;
}

/** Every string in the module, including code, which must never embed links or scripts. */
function allStrings(topic: DocsTopic): string[] {
  return [
    ...proseStrings(topic),
    ...topic.sections.flatMap(section =>
      section.blocks.flatMap(block =>
        block.kind === 'commands'
          ? block.commands
          : block.kind === 'steps'
            ? block.steps.flatMap(step => (step.command === undefined ? [] : [step.command]))
            : []
      )
    ),
  ];
}

describe('docs handbook content', () => {
  it('ships exactly the eight registry slugs in sidebar order', () => {
    expect(DOCS_TOPICS.map(topic => topic.slug)).toEqual([...REGISTRY_SLUGS]);
    expect(TOPICS.map(topic => topic.slug)).toEqual([...REGISTRY_SLUGS]);
  });

  it.each(TOPICS.map(topic => [topic.slug, topic] as const))(
    'keeps %s metadata consistent with the registry',
    (_, topic) => {
      const meta = DOCS_TOPICS.find(entry => entry.slug === topic.slug);
      expect(meta).toBeDefined();
      expect(topic.navLabel).toBe(meta?.navLabel);
      expect(topic.title).toBe(meta?.title);
      expect(topic.summary).toBe(meta?.summary);
      expect(topic.source).toBe(meta?.source);
    }
  );

  it.each(TOPICS.map(topic => [topic.slug, topic] as const))(
    'keeps the %s summary truthful in length',
    (_, topic) => {
      expect(topic.summary.length).toBeGreaterThan(0);
      expect(topic.summary.length).toBeLessThanOrEqual(160);
    }
  );

  it.each(TOPICS.map(topic => [topic.slug, topic] as const))(
    'pins verifiable provenance for %s',
    (_, topic) => {
      expect(topic.source.repo).toBe('PyRo1121/omg');
      expect(topic.source.path).toMatch(/^docs\/[a-z0-9-]+\.md$/u);
      expect(topic.source.reviewedCommit).toMatch(HEX_COMMIT);
      expect(topic.source.reviewedAt).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(topic.source.reviewedAt))).toBe(false);
      expect(docsSourceHref(topic.source)).toBe(
        `https://github.com/PyRo1121/omg/blob/${topic.source.reviewedCommit}/${topic.source.path}`
      );
    }
  );

  it.each(TOPICS.map(topic => [topic.slug, topic] as const))(
    'structures %s sections with unique kebab-case anchors',
    (_, topic) => {
      expect(topic.sections.length).toBeGreaterThanOrEqual(1);
      const ids = topic.sections.map(section => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(KEBAB_CASE);
      for (const section of topic.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.blocks.length).toBeGreaterThanOrEqual(1);
      }
    }
  );

  it.each(TOPICS.map(topic => [topic.slug, topic] as const))(
    'keeps every %s table two-column with matching rows',
    (_, topic) => {
      for (const section of topic.sections) {
        for (const block of section.blocks) {
          if (block.kind !== 'table') continue;
          expect(block.columns).toHaveLength(2);
          expect(block.rows.length).toBeGreaterThanOrEqual(1);
          for (const row of block.rows) expect(row).toHaveLength(2);
        }
      }
    }
  );

  it.each(TOPICS.map(topic => [topic.slug, topic] as const))(
    'keeps %s prose free of markup and free of embedded links',
    (_, topic) => {
      for (const text of proseStrings(topic)) {
        // Command placeholders such as <query> are fine; HTML tags are not.
        expect(text).not.toMatch(/<(script|iframe|img|svg|style|link|meta|html|body)\b/iu);
        expect(text).not.toContain('http');
      }
      for (const command of allStrings(topic)) {
        expect(command.toLowerCase()).not.toContain('<script');
      }
    }
  );

  it('keeps the runtime guide aligned with the current runtime contract', () => {
    const runtimeGuide = allStrings(runtimesTopic).join('\n');

    expect(runtimeGuide).toContain('Deno');
    expect(runtimeGuide).toContain('omg use deno latest');
    expect(runtimeGuide).toContain('.node-version, .nvmrc, package.json, then .tool-versions');
    expect(runtimeGuide).toContain('.python-version, pyproject.toml, then .tool-versions');
    expect(runtimeGuide).not.toContain('bunx');
  });

  it('rejects dangerous or removed instructions from the handbook', () => {
    const handbook = TOPICS.flatMap(allStrings).join('\n');

    expect(handbook).not.toContain('cache.redb');
    expect(handbook).not.toContain('Intel through Rosetta');
    expect(handbook).not.toContain('omg use rust stable --components');
    expect(handbook).not.toContain('omg completions zsh >');
    expect(handbook).not.toContain('audit verify proves');
    expect(handbook).not.toContain('no privilege escalation');
  });

  it('emits canonical internal hrefs for every topic', () => {
    for (const topic of DOCS_TOPICS) {
      expect(docsTopicHref(topic.slug)).toBe(`/docs/${topic.slug}/`);
    }
    expect(docsTopicHref('installation')).toMatch(/^\/docs\/[a-z-]+\/$/u);
  });
});
