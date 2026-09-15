import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'layers',
      heading: 'Reproducibility has more than one layer',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'A working development machine combines system packages, language runtimes, project dependencies, configuration, and services. OMG environment workflows capture and check supported environment state; a dependency lockfile still belongs to the package manager that produced it.',
          ],
        },
        {
          kind: 'table',
          title: 'What to keep with a project',
          columns: ['Layer', 'Record and verify'],
          rows: [
            [
              'Language runtime',
              'A project version file plus an installed version that matches it.',
            ],
            ['JavaScript dependencies', 'package.json and the chosen npm, pnpm, or Bun lockfile.'],
            [
              'Python dependencies',
              'The dependency and locking files used by the project; recreate its virtual environment as needed.',
            ],
            ['OMG environment', 'Captured omg.lock state and the results of omg env check.'],
            [
              'External services and secrets',
              'Separate setup instructions and approved secret delivery; do not assume a runtime lockfile provisions them.',
            ],
          ],
        },
      ],
    },
    {
      id: 'capture',
      heading: 'Capture a known working environment',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Install the project’s required runtimes and dependencies, then run the project tests before capturing its environment. Review generated files before sharing them or committing them to source control.',
          ],
        },
        {
          kind: 'commands',
          title: 'Capture and inspect drift',
          commands: ['omg env capture', 'omg env check'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The environment check compares the local state with the recorded state. Investigate a difference instead of immediately recapturing it, which would make the changed environment your new baseline.',
            'The handbook documents sharing and sync through an OMG share URL. Use only a trusted environment source and review the changes before applying it. Do not treat arbitrary third-party share links as setup instructions.',
          ],
        },
      ],
    },
    {
      id: 'onboarding',
      heading: 'Check the setup on another machine',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'Install OMG and configure the supported shell integration.' },
            {
              text: 'Install the project’s required runtime versions and inspect the selected executables.',
            },
            { text: 'Use the project’s dependency manager with its committed lockfile.' },
            { text: 'Compare the supported environment state.', command: 'omg env check' },
            { text: 'Run the project’s own tests and document platform-specific requirements.' },
          ],
        },
      ],
    },
    {
      id: 'limits',
      heading: 'Keep the boundary of the guarantee clear',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'An environment snapshot is not a full operating-system image. It does not establish that databases, external services, secrets, native dependencies, or all OS-specific behavior are identical.',
            'In CI, explicitly provision the supported runner and dependencies. Use the project’s own tests as the final check that the environment can do its job. This guide is source-reviewed guidance rather than a published cross-platform reproduction result.',
          ],
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG daily workflows', href: '/docs/workflows/' },
    { title: 'OMG environment command reference', href: '/docs/cli/' },
    { title: 'OMG configuration and policy', href: '/docs/configuration/' },
  ],
  related: ['/guides/node-npm-pnpm/', '/runtimes/python/', '/compare/omg-vs-mise/'],
};
