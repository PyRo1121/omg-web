import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'start',
      heading: 'Install Node.js and inspect the selected runtime',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'OMG manages the Node.js runtime and the npm and npx binaries distributed with it. npm continues to install your project dependencies. Start with OMG installed and the shell integration enabled. An existing project should keep its required version; use the LTS example only when choosing a runtime for a new project.',
            'OMG supports Linux and Apple Silicon macOS through its installer. Windows users run it inside WSL; this is not a native Windows installation method.',
          ],
        },
        {
          kind: 'commands',
          title: 'Install the current Node.js LTS release and inspect it',
          commands: ['omg use node lts', 'omg list node', 'omg which node'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Before running node or npm, create a .node-version file in the project containing the exact installed version reported by omg list node, or retain an existing .nvmrc that requests that version. Do not overwrite a project requirement without reviewing it. Let the enabled shell hook run at a new prompt, then check the executable.',
            'omg use updates OMG’s current selection; it does not by itself put that runtime on an otherwise unpinned shell’s PATH. The hook restores the base PATH when no project pin matches.',
          ],
        },
        {
          kind: 'commands',
          title: 'Verify the project pin at a new prompt',
          commands: ['which -a node', 'node --version', 'npm --version'],
        },
      ],
    },
    {
      id: 'project',
      heading: 'Keep the project on the intended version',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'The reviewed runtime implementation checks .node-version, .nvmrc, .tool-versions, and then package.json. The shell hook searches the current directory and its parents. A nearer project pin can override a selection made outside the project.',
            'Install the required version with omg use node followed by that version. Record the exact version your project requires in .node-version or retain its existing .nvmrc. Check the result in a new prompt before committing the version file.',
          ],
        },
        {
          kind: 'commands',
          title: 'Inspect installed and available versions',
          commands: ['omg list node', 'omg list node --available', 'omg which node'],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'A Node.js version file does not lock JavaScript dependencies. Keep package-lock.json, pnpm-lock.yaml, or bun.lock with the dependency manager that owns it.',
        },
      ],
    },
    {
      id: 'dependencies',
      heading: 'Continue using npm or pnpm for dependencies',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'For an npm project with a committed package-lock.json, npm ci installs from that lockfile and checks its consistency with package.json. Use npm install when intentionally changing dependencies. Do not interchange package managers just to run a runtime manager.',
            'pnpm is a separate tool with its own version policy and runtime-management features. If pnpm itself selects Node.js for a project, understand that choice before adding an OMG pin. The linked workflow guide explains the ownership boundaries.',
          ],
        },
        {
          kind: 'commands',
          title: 'Install an existing npm project',
          commands: ['node --version', 'npm --version', 'npm ci'],
        },
      ],
    },
    {
      id: 'troubleshooting',
      heading: 'When Node.js or npm comes from the wrong place',
      blocks: [
        {
          kind: 'commands',
          title: 'Inspect the shell before reinstalling',
          commands: [
            'omg which node',
            'which -a node',
            'which -a npm',
            'node --version',
            'npm --version',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'A previously activated nvm, system installation, or another version manager can appear earlier in PATH. Review the shell profile and enable only the manager intended for this project. Keep the old installation until the new workflow works.',
            'OMG is alpha software. These instructions are reviewed against the linked source documentation, not a claim of execution on every supported platform. Consult the runtime handbook for verification, storage, and version-file details.',
          ],
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG runtime handbook and source provenance', href: '/docs/runtimes/' },
    { title: 'npm ci documentation', href: 'https://docs.npmjs.com/cli/commands/npm-ci' },
    { title: 'pnpm runtime management', href: 'https://pnpm.io/cli/runtime' },
  ],
  related: ['/guides/node-npm-pnpm/', '/guides/migrate-from-nvm/', '/runtimes/bun/'],
};
