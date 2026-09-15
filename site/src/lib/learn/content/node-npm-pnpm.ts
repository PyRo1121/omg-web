import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'ownership',
      heading: 'Decide which tool owns each part of the project',
      blocks: [
        {
          kind: 'table',
          title: 'Toolchain responsibilities',
          columns: ['Layer', 'Responsibility'],
          rows: [
            [
              'OMG',
              'Select a Node.js runtime and its bundled npm; manage supported system packages and OMG environment workflows.',
            ],
            ['npm', 'Install JavaScript dependencies and maintain package-lock.json.'],
            [
              'pnpm',
              'Install dependencies and maintain pnpm-lock.yaml. Current versions can also select runtimes and the package-manager version.',
            ],
            [
              'Project configuration',
              'Record the expected runtime, package manager, dependency resolutions, and build commands.',
            ],
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'OMG does not turn npm install or pnpm install into OMG commands. It gives you a selected runtime on PATH. Keep the repository’s dependency manager and lockfile unless you are intentionally migrating them.',
            'If pnpm already manages the project runtime, decide whether to keep that policy or use an OMG runtime pin. Do not assume that the Node.js used by pnpm scripts is the same as the Node.js first on your interactive PATH.',
          ],
        },
      ],
    },
    {
      id: 'npm',
      heading: 'An existing npm project',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Install the Node.js version required by the project using OMG. Enable the shell hook, enter the project, and confirm the version at the next prompt. Keep the existing .nvmrc or .node-version if it records the correct requirement.',
          ],
        },
        {
          kind: 'commands',
          title: 'Inspect and install from the committed npm lockfile',
          commands: ['omg which node', 'node --version', 'npm --version', 'npm ci'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'npm ci is for an existing project with a compatible package-lock.json. It removes the current node_modules before installing. Use npm install when adding or updating dependencies, and review the resulting lockfile diff. Run the repository’s own checks after installation.',
          ],
        },
      ],
    },
    {
      id: 'pnpm',
      heading: 'An existing pnpm project',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Follow pnpm’s official installation instructions and the repository’s packageManager requirement. Do not assume Corepack is bundled with every Node.js release. Avoid installing a different global pnpm version to repair a project that intentionally pins its own.',
            'After installing the required pnpm version, inspect both its executable and the runtime used for project commands.',
          ],
        },
        {
          kind: 'commands',
          title: 'Inspect the pnpm environment and use its lockfile',
          commands: [
            'node --version',
            'pnpm --version',
            'pnpm exec node --version',
            'pnpm install --frozen-lockfile',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'A frozen install should match the project manifest and committed lockfile. Resolve a mismatch as an intentional dependency change rather than deleting the lockfile. Native dependencies or package-manager policy may still need platform-specific configuration.',
          ],
        },
      ],
    },
    {
      id: 'team',
      heading: 'Make the same choices visible to the team',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Commit the project’s runtime requirement and dependency lockfile.',
            'Document the package-manager version and how a fresh machine installs it.',
            'Run the same dependency and test commands in CI.',
            'Use OMG environment checks as an additional layer; they do not replace the dependency manager’s lockfile checks.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'This guide documents tool boundaries and source-reviewed commands. It does not claim that every pnpm runtime feature or dependency installation has been tested with OMG on every platform.',
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG runtime handbook', href: '/docs/runtimes/' },
    { title: 'npm ci reference', href: 'https://docs.npmjs.com/cli/commands/npm-ci' },
    { title: 'pnpm installation', href: 'https://pnpm.io/installation' },
    { title: 'pnpm runtime configuration', href: 'https://pnpm.io/package_json' },
  ],
  related: ['/runtimes/node/', '/runtimes/bun/', '/guides/reproducible-dev-environments/'],
};
