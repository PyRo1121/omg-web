/**
 * Typed model for the curated native documentation handbook.
 *
 * A docs page is a distillation of one upstream markdown file in the
 * PyRo1121/omg CLI repository. Every renderable unit is a typed value; no
 * variant carries markup, so the renderer can only emit escaped text.
 */

/** Slugs the omg CLI repository owns a handbook topic for. */
export type DocsTopicSlug =
  | 'installation'
  | 'cli'
  | 'configuration'
  | 'runtimes'
  | 'workflows'
  | 'security'
  | 'troubleshooting'
  | 'architecture';

/** Provenance of one curated topic: the upstream truth it was reviewed against. */
export interface DocsSourceProvenance {
  /** Upstream repository that owns the canonical documentation. */
  readonly repo: 'PyRo1121/omg';
  /** Upstream markdown file this topic distills, relative to the repository root. */
  readonly path: `docs/${string}.md`;
  /** Upstream commit the content was last verified against (7 to 40 hex characters). */
  readonly reviewedCommit: string;
  /** ISO date (YYYY-MM-DD) of that review. */
  readonly reviewedAt: string;
}

/** One ordered step in a numbered procedure, with an optional command to run. */
interface DocsStep {
  readonly text: string;
  /** Optional command shown beneath the step text. */
  readonly command?: string;
}

/**
 * Every renderable content block. Non-empty tuples guarantee that a section
 * renders content, a table has a header pair and at least one row, and a
 * command group lists at least one command.
 */
export type DocsBlock =
  /** One or more plain paragraphs. */
  | { readonly kind: 'paragraphs'; readonly paragraphs: readonly [string, ...string[]] }
  /** A titled group of commands rendered as one code block. */
  | {
      readonly kind: 'commands';
      readonly title: string;
      readonly commands: readonly [string, ...string[]];
    }
  /** A numbered procedure where each step may carry a command. */
  | { readonly kind: 'steps'; readonly steps: readonly [DocsStep, ...DocsStep[]] }
  /** A titled two-column reference table. Every row has exactly two cells. */
  | {
      readonly kind: 'table';
      readonly title: string;
      readonly columns: readonly [string, string];
      readonly rows: readonly [
        readonly [string, string],
        ...(readonly (readonly [string, string])[]),
      ];
    }
  /** A bulleted list of facts or requirements. */
  | { readonly kind: 'bullets'; readonly items: readonly [string, ...string[]] }
  /** A callout that highlights a default, a limit, or a failure mode. */
  | { readonly kind: 'note'; readonly tone: 'info' | 'warning'; readonly text: string };

/** One titled section of a topic page with an anchor id and at least one block. */
interface DocsSection {
  /** Kebab-case anchor id, unique within the topic. */
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly [DocsBlock, ...DocsBlock[]];
}

/** One complete curated handbook topic: registry metadata plus authored sections. */
export interface DocsTopic {
  readonly slug: DocsTopicSlug;
  readonly navLabel: string;
  /** Page h1 and title prefix; owned by omg-web, not synced from upstream. */
  readonly title: string;
  /** Meta description; authored, truthful, at most 160 characters. */
  readonly summary: string;
  readonly source: DocsSourceProvenance;
  readonly sections: readonly [DocsSection, ...DocsSection[]];
}
