type LearningCategory = 'runtimes' | 'guides' | 'compare';

export interface LearningPageMeta {
  readonly slug: string;
  readonly category: LearningCategory;
  readonly title: string;
  readonly description: string;
  /** Date the authored page content changed, not the deployment date. */
  readonly modified: string;
}

export const LEARNING_CATEGORIES = {
  runtimes: {
    title: 'Language runtimes',
    description:
      'Install and switch Node.js, Bun, and Python versions with OMG. Understand project pins, shell setup, and supported platforms.',
  },
  guides: {
    title: 'Developer workflow guides',
    description:
      'Use OMG with npm and pnpm, migrate from nvm, and capture development environments with practical, source-reviewed guides.',
  },
  compare: {
    title: 'Compare developer tools',
    description:
      'Compare OMG with other tool managers using documented behavior, supported platforms, and explicit tradeoffs.',
  },
} as const;

export const LEARNING_PAGES = [
  {
    category: 'runtimes',
    slug: 'node',
    title: 'Manage Node.js versions with OMG',
    description:
      'Install Node.js, use its bundled npm, switch project versions with .nvmrc or .node-version, and diagnose PATH conflicts.',
    modified: '2026-09-14',
  },
  {
    category: 'runtimes',
    slug: 'bun',
    title: 'Install and switch Bun versions',
    description:
      'Manage Bun versions with OMG, use .bun-version for a project, and understand how Bun package installation differs from runtime management.',
    modified: '2026-09-14',
  },
  {
    category: 'runtimes',
    slug: 'python',
    title: 'Manage Python versions and virtual environments',
    description:
      'Select Python with OMG, isolate project dependencies in a virtual environment, and understand .python-version and PATH behavior.',
    modified: '2026-09-14',
  },
  {
    category: 'guides',
    slug: 'node-npm-pnpm',
    title: 'Use Node.js, npm, and pnpm with OMG',
    description:
      'Separate runtime selection from dependency installation. Use an OMG-managed Node.js with npm or pnpm and keep each tool responsible for its lockfile.',
    modified: '2026-09-14',
  },
  {
    category: 'guides',
    slug: 'migrate-from-nvm',
    title: 'Move an nvm project to OMG',
    description:
      'Keep your .nvmrc, select Node.js with OMG, check npm and PATH, and migrate shell setup without deleting your existing nvm installation.',
    modified: '2026-09-14',
  },
  {
    category: 'guides',
    slug: 'reproducible-dev-environments',
    title: 'Capture and check development environments',
    description:
      'Use OMG environment capture and drift checks alongside runtime pins and dependency lockfiles. Learn what each layer does and what remains outside it.',
    modified: '2026-09-14',
  },
  {
    category: 'compare',
    slug: 'omg-vs-mise',
    title: 'OMG vs mise: packages, runtimes, and workflows',
    description:
      'Compare OMG and mise by system packages, runtime selection, version files, environment workflows, and platform support. Includes dated source references.',
    modified: '2026-09-14',
  },
] as const satisfies readonly LearningPageMeta[];

export const learningHref = (page: LearningPageMeta): string => `/${page.category}/${page.slug}/`;
