/**
 * Pure metadata registry for the eight curated docs topics, in sidebar and
 * sitemap order. Worker-safe: imports no content modules and touches no
 * filesystem, so the docs index, sitemap, and cache policy stay small.
 */
import type { DocsSourceProvenance, DocsTopicSlug } from './topic';

/** Registry entry for one shipped topic, without its authored sections. */
interface DocsTopicMeta {
  readonly slug: DocsTopicSlug;
  /** Short sidebar and index label. */
  readonly navLabel: string;
  /** Page h1 and title prefix. */
  readonly title: string;
  /** Meta description; authored, truthful, at most 160 characters. */
  readonly summary: string;
  /** Upstream reference file and commit reviewed alongside the implementation. */
  readonly source: DocsSourceProvenance;
}

const reviewedCommit = '2bb910395ed5f7bd1a40cbf431fde032e876140e';
const reviewedAt = '2026-09-03';

const REGISTRY = {
  installation: {
    slug: 'installation',
    navLabel: 'Installation',
    title: 'Installing OMG',
    summary:
      'Install OMG on Arch, Debian, Ubuntu, Fedora, and macOS, enable shell integration, update, and uninstall cleanly.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/installation.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  cli: {
    slug: 'cli',
    navLabel: 'CLI reference',
    title: 'CLI reference',
    summary:
      'Every OMG command for packages, runtimes, audits, environments, and maintenance, with the options that matter day to day.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/cli.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  configuration: {
    slug: 'configuration',
    navLabel: 'Configuration',
    title: 'Configuration and policy',
    summary:
      'Configure OMG through config.toml and policy.toml. Learn file locations, security grades, version files, and environment variables.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/configuration.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  runtimes: {
    slug: 'runtimes',
    navLabel: 'Runtimes',
    title: 'Runtime management',
    summary:
      'Install and switch Node.js, Python, Go, Rust, Ruby, Java, Bun, Deno, and Pi versions with version-file auto-detection.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/runtimes.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  workflows: {
    slug: 'workflows',
    navLabel: 'Workflows',
    title: 'Daily workflows',
    summary:
      'Daily development, team onboarding, CI pipelines, and maintenance routines built on OMG lockfiles and commands.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/workflows.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  security: {
    slug: 'security',
    navLabel: 'Security',
    title: 'Security model',
    summary:
      'Package policy, vulnerability and secret scanning, SBOM export, Sigstore checks, telemetry, and the tamper-evident audit log.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/security.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  troubleshooting: {
    slug: 'troubleshooting',
    navLabel: 'Troubleshooting',
    title: 'Troubleshooting',
    summary:
      'Fix daemon, shell hook, policy, cache, and rollback problems with the diagnostics OMG ships for each failure mode.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/troubleshooting.md',
      reviewedCommit,
      reviewedAt,
    },
  },
  architecture: {
    slug: 'architecture',
    navLabel: 'Architecture',
    title: 'Architecture',
    summary:
      'How the omg CLI, omgd daemon, and omg-fast prompt binary cooperate through caching, IPC, and background workers.',
    source: {
      repo: 'PyRo1121/omg',
      path: 'docs/architecture.md',
      reviewedCommit,
      reviewedAt,
    },
  },
} as const satisfies { readonly [Slug in DocsTopicSlug]: DocsTopicMeta };

/** All eight shipped topics in sidebar, index, and sitemap order. */
export const DOCS_TOPICS = [
  REGISTRY.installation,
  REGISTRY.cli,
  REGISTRY.configuration,
  REGISTRY.runtimes,
  REGISTRY.workflows,
  REGISTRY.security,
  REGISTRY.troubleshooting,
  REGISTRY.architecture,
] as const;

/** Look up one registry entry. The slug type guarantees an entry exists. */
export const docsTopicMeta = <Slug extends DocsTopicSlug>(slug: Slug): (typeof REGISTRY)[Slug] =>
  REGISTRY[slug];

/** Canonical internal href for a topic page, with the trailing slash the site canonicalizes. */
export const docsTopicHref = (slug: DocsTopicSlug): `/docs/${DocsTopicSlug}/` => `/docs/${slug}/`;

/**
 * Pinned GitHub reference href. The link stays on the exact commit reviewed
 * alongside the CLI implementation.
 */
export const docsSourceHref = (source: DocsSourceProvenance): string =>
  `https://github.com/${source.repo}/blob/${source.reviewedCommit}/${source.path}`;
