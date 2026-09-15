import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'roles',
      heading: 'A runtime manager and a package manager do different jobs',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Bun includes a JavaScript runtime and a package manager. OMG installs and selects the Bun binary. Bun then runs your application or installs its dependencies. Choosing a Bun version with OMG does not automatically migrate an npm or pnpm project.',
            'Use OMG on supported Linux distributions, Apple Silicon macOS, or Linux inside WSL. Native Windows is not supported by OMG even though Bun itself offers Windows builds.',
          ],
        },
      ],
    },
    {
      id: 'install',
      heading: 'Install Bun and check the selected binary',
      blocks: [
        {
          kind: 'commands',
          title: 'Install the latest Bun release for a new project',
          commands: ['omg use bun latest', 'omg list bun', 'omg which bun'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Enable OMG shell integration first. For a new project, create .bun-version containing the exact installed version reported by omg list bun. For a project that already pins Bun, install its required version instead of changing it to latest.',
            'Let the hook run at the next prompt before checking bun. Without a matching project pin, omg use alone does not add the selected Bun binary to the shell PATH.',
          ],
        },
        {
          kind: 'commands',
          title: 'Verify the project pin at a new prompt',
          commands: ['which -a bun', 'bun --version'],
        },
      ],
    },
    {
      id: 'pin',
      heading: 'Pin the version a project needs',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'The reviewed OMG shell hook checks .bun-version, .tool-versions, then package.json for Bun. Keep the exact required version in the project version file and install that version with omg use bun followed by the version.',
            'A Bun runtime pin and bun.lock serve different purposes. The pin chooses the executable; the lockfile records dependency resolutions. Commit both when your project relies on both.',
          ],
        },
        {
          kind: 'commands',
          title: 'Check the active version',
          commands: ['omg which bun', 'which -a bun', 'bun --version'],
        },
      ],
    },
    {
      id: 'workflows',
      heading: 'Use Bun without accidentally changing the toolchain',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Bun documents its package manager as usable in existing Node.js projects. That does not mean you should replace a committed npm or pnpm lockfile without reviewing the migration. Follow the dependency manager selected by the repository.',
            'For an existing Bun project, follow its documented install and CI commands. For a migration, work in a separate Git branch, review the generated lockfile, and run the project tests. Package compatibility, lifecycle scripts, and native dependencies need project-specific validation.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'OMG package-search benchmarks do not measure bun install, npm install, or JavaScript runtime execution. No performance comparison between those operations is claimed here.',
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG runtime handbook and source provenance', href: '/docs/runtimes/' },
    { title: 'Bun package manager documentation', href: 'https://bun.com/docs/pm/cli/install' },
  ],
  related: ['/runtimes/node/', '/guides/node-npm-pnpm/', '/docs/configuration/'],
};
