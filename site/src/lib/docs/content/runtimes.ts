/**
 * Curated runtime handbook. Reviewed against the PyRo1121/omg implementation and
 * docs/runtimes.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const runtimesTopic: DocsTopic = {
  ...docsTopicMeta('runtimes'),
  sections: [
    {
      id: 'supported',
      heading: 'Supported runtimes',
      blocks: [
        {
          kind: 'table',
          title: 'Native runtimes and their binaries',
          columns: ['Runtime', 'Install and inspect'],
          rows: [
            ['Node.js', 'omg use node 20, then omg which node. Provides node, npm, and npx'],
            ['Python', 'omg use python 3.12. Provides python3 and pip'],
            ['Go', 'omg use go 1.21. Provides go and gofmt'],
            ['Rust', 'omg use rust stable or omg use rust nightly. Provides rustc and cargo'],
            ['Ruby', 'omg use ruby 3.2. Provides ruby and gem'],
            ['Java', 'omg use java 21. Provides java and javac'],
            ['Bun', 'omg use bun latest. Provides bun'],
            ['Deno', 'omg use deno latest. Provides deno'],
            ['Pi', 'omg use pi 0.83.0. Installs through npm with lifecycle scripts disabled'],
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Unknown runtime names fail explicitly. OMG does not invoke or download another version manager.',
        },
      ],
    },
    {
      id: 'switching',
      heading: 'How version switching works',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              text: 'The generated shell hook invokes omg hook-env when the prompt or directory changes.',
            },
            {
              text: 'OMG reads version files in the current directory and then walks through its parents. The nearest pin wins.',
            },
            {
              text: 'The hook resets the base PATH and prepends the concrete installed version directory requested by each pin.',
            },
            { text: 'Subshells, tmux, and screen inherit the resulting PATH.' },
          ],
        },
        {
          kind: 'table',
          title: 'Version file priority per runtime',
          columns: ['Runtime', 'Detection order'],
          rows: [
            ['Node.js', '.node-version, .nvmrc, package.json, then .tool-versions'],
            ['Python', '.python-version, pyproject.toml, then .tool-versions'],
            ['Go', '.go-version, go.mod, then .tool-versions'],
            ['Rust', 'rust-toolchain, rust-toolchain.toml, then .tool-versions'],
            ['Bun', '.bun-version, package.json, then .tool-versions'],
            ['Deno', '.deno-version, .dvmrc, then .tool-versions'],
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'When no version file matches, the hook restores the base PATH. omg use installs the requested version and updates its current symlink. A matching project pin controls PATH the next time the hook runs.',
          ],
        },
      ],
    },
    {
      id: 'examples',
      heading: 'Common runtime tasks',
      blocks: [
        {
          kind: 'commands',
          title: 'Node.js',
          commands: [
            'omg use node lts',
            'omg list node',
            'omg list node --available',
            'omg which node',
          ],
        },
        {
          kind: 'commands',
          title: 'Python with a virtual environment',
          commands: ['omg use python 3.12', 'python -m venv .venv', 'source .venv/bin/activate'],
        },
        {
          kind: 'commands',
          title: 'Rust components through rust-toolchain.toml',
          commands: ['[toolchain]', 'channel = "stable"', 'components = ["clippy", "rustfmt"]'],
        },
        {
          kind: 'commands',
          title: 'Deno',
          commands: [
            'omg use deno latest',
            'echo "2.9" > .deno-version',
            'omg list deno --available',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Versions captured in omg.lock travel with the project. Run omg env capture after installing the runtimes a project needs, and teammates verify with omg env check.',
          ],
        },
      ],
    },
    {
      id: 'storage',
      heading: 'Where versions live and how they are verified',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Every runtime installs under the OMG data directory. The default versions path is ~/.local/share/omg/versions on Linux and ~/Library/Application Support/omg/versions on macOS. Runtime switching does not need sudo.',
            'Runtime managers verify published SHA-256 checksums. Python uses python-build-standalone metadata, Java uses Adoptium checksums, and Bun and Deno use release metadata or checksum sidecars.',
            'Direct runtime downloads use HTTPS with certificate validation.',
            'OMG extracts each runtime into a temporary directory on the same filesystem, then publishes the version directory after extraction and validation succeed.',
            'Each installed version has its own directory. Switch away from a version before removing its directory manually.',
          ],
        },
      ],
    },
    {
      id: 'migration',
      heading: 'Migrating from other version managers',
      blocks: [
        {
          kind: 'note',
          tone: 'warning',
          text: 'There are no automatic migration subcommands. omg migrate only exports and imports a portable environment manifest. Migration from nvm, pyenv, or rustup is manual and non-destructive.',
        },
        {
          kind: 'steps',
          steps: [
            {
              text: 'Note your versions with the old tool, for example nvm list or pyenv versions.',
            },
            { text: 'Install the same versions with OMG.', command: 'omg use node 20' },
            {
              text: 'Keep both managers installed until you trust the switch, then remove the old entries from your shell profile.',
            },
          ],
        },
      ],
    },
    {
      id: 'problems',
      heading: 'When versions do not switch',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'Inspect the version OMG selected.', command: 'omg which node' },
            {
              text: 'Check that the selected directory comes first in PATH.',
              command: 'which -a node',
            },
            {
              text: 'Confirm the project pin requests an installed version.',
              command: 'cat .node-version',
            },
            {
              text: 'Install or reactivate the requested version.',
              command: 'omg use node 20.10.0',
            },
            { text: 'Restart the shell so the hook reloads.', command: 'exec zsh' },
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'If the shell hook is missing entirely, PATH never updates on directory change. Confirm that eval of omg hook for your shell is present in the profile, and see the troubleshooting topic for the full checklist. Conflicting global packages from a previous manager can shadow OMG binaries; remove those PATH entries first.',
          ],
        },
      ],
    },
  ],
};
