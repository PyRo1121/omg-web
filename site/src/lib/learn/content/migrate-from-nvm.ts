import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'before',
      heading: 'Keep the existing installation while you check the replacement',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'OMG reads .nvmrc, so an existing version file can stay in the project. It does not import nvm’s installed Node.js directories or move global npm packages automatically. Treat the migration as a change to runtime and shell ownership.',
            'Before editing your shell profile, save a copy and record the currently selected Node.js and npm versions. Keep nvm installed until the new shell and project checks succeed. OMG targets Linux, Apple Silicon macOS, and WSL; this guide is not a migration path for native Windows nvm-windows.',
          ],
        },
        {
          kind: 'commands',
          title: 'Record the current project environment',
          commands: [
            'node --version',
            'npm --version',
            'which -a node',
            'which -a npm',
            'npm list --global --depth=0',
          ],
        },
      ],
    },
    {
      id: 'select',
      heading: 'Install the version your project already requires',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Read the project’s .nvmrc and install its required Node.js release with omg use node followed by the version. Use an explicit version for the initial migration if an alias is ambiguous.',
            'Follow the OMG installation guide to enable the hook for your shell. Disable the nvm initialization line in your saved shell profile only after you have identified it. Avoid running two auto-switching hooks for the same project.',
          ],
        },
        {
          kind: 'commands',
          title: 'Inspect the selected runtime after opening a fresh shell',
          commands: [
            'omg which node',
            'node --version',
            'npm --version',
            'which -a node',
            'which -a npm',
          ],
        },
      ],
    },
    {
      id: 'verify',
      heading: 'Check the project before removing anything',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Enter the project and let the shell hook run. Confirm that .nvmrc selects the required installed runtime. In the reviewed OMG implementation, .node-version has priority over .nvmrc; resolve conflicting files deliberately.',
            'Run the repository’s documented dependency installation and tests. Global npm tools installed under nvm may need a separate installation or an explicit project dependency. Do not copy an old runtime’s bin directory into the new one.',
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'omg migrate is an environment-manifest import/export command. It is not an automatic migration command for nvm, pyenv, or rustup.',
        },
      ],
    },
    {
      id: 'rollback',
      heading: 'Return to nvm if a project is not ready',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Restore the saved shell profile or re-enable the nvm initialization and disable the OMG hook for that shell. Open a fresh shell and check node --version and which -a node again.',
            'Keep the existing .nvmrc and dependency lockfile. Removing an old runtime installation is a separate cleanup decision after every dependent project has been checked.',
          ],
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG runtime migration behavior', href: '/docs/runtimes/' },
    { title: 'OMG shell installation', href: '/docs/installation/' },
    { title: 'nvm documentation', href: 'https://github.com/nvm-sh/nvm' },
  ],
  related: ['/runtimes/node/', '/guides/node-npm-pnpm/', '/docs/troubleshooting/'],
};
