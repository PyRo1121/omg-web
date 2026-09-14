/**
 * Curated CLI reference. Reviewed against the PyRo1121/omg implementation and
 * docs/cli.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const cliTopic: DocsTopic = {
  ...docsTopicMeta('cli'),
  sections: [
    {
      id: 'packages',
      heading: 'Package commands',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Package commands work against the native backend of your distribution and the AUR on Arch. Installations are recorded as transactions you can inspect and roll back.',
          ],
        },
        {
          kind: 'commands',
          title: 'Everyday package operations',
          commands: [
            'omg search ripgrep',
            'omg install neovim',
            'omg info firefox',
            'omg update',
            'omg remove firefox -r',
          ],
        },
        {
          kind: 'table',
          title: 'Package command reference',
          columns: ['Command', 'Purpose'],
          rows: [
            [
              'omg search <query>',
              'Search official repositories and the AUR. Use --detailed, --no-aur, and --limit',
            ],
            [
              'omg install <packages>',
              'Install packages after security policy checks. Use --yes or --dry-run',
            ],
            ['omg remove <packages>', 'Remove packages. Use --recursive, --yes, or --dry-run'],
            [
              'omg update',
              'Update official and AUR packages. Use --check, --fast, --turbo, --yes, or --dry-run',
            ],
            [
              'omg info <package>',
              'Show available package metadata. Fields vary by platform and source',
            ],
            [
              'omg clean',
              'Remove orphans and caches. Use --orphans, --cache, --aur, --all, or --dry-run',
            ],
            ['omg explicit', 'List explicitly installed packages. --count prints only the number'],
            ['omg sync', 'Synchronize package databases'],
            [
              'omg why <package>',
              'Show the dependency chain that keeps a package installed. --reverse shows dependents',
            ],
            ['omg outdated', 'List packages with available updates'],
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Removal and update operations prompt for confirmation unless you pass --yes. Use --dry-run to preview any transaction first.',
        },
      ],
    },
    {
      id: 'runtimes',
      heading: 'Runtime commands',
      blocks: [
        {
          kind: 'commands',
          title: 'Install and select runtime versions',
          commands: [
            'omg use node 20.10.0',
            'omg use python 3.12',
            'omg use rust stable',
            'omg list node --available',
            'omg which node',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg use downloads the version if needed, points the current symlink at it, and lets the shell hook update PATH. Supported runtimes are node, bun, python, go, rust, ruby, java, and pi. Unsupported names fail explicitly instead of falling back to another manager. Version files such as .nvmrc and .python-version are detected automatically.',
          ],
        },
      ],
    },
    {
      id: 'audit',
      heading: 'Security and diagnostics',
      blocks: [
        {
          kind: 'commands',
          title: 'Audit and health checks',
          commands: ['omg audit', 'omg audit secrets', 'omg status --fast', 'omg doctor --network'],
        },
        {
          kind: 'table',
          title: 'Diagnostic commands',
          columns: ['Command', 'What it reports'],
          rows: [
            [
              'omg status',
              'Package totals, explicit packages, orphans, and available updates. --fast skips expensive counts',
            ],
            [
              'omg doctor',
              'Connectivity, required tools, backend health, daemon status, PATH, and shell hook. Use --network for mirrors and --eol for runtime support',
            ],
            ['omg audit', 'OSV vulnerability scan of installed packages'],
            ['omg audit secrets', 'Scan the current directory or a path for leaked credentials'],
            ['omg history', 'Transaction history with filters for package, type, and date range'],
          ],
        },
      ],
    },
    {
      id: 'run',
      heading: 'Task runner',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg run detects the project ecosystem and delegates to its native tool, so one command works across repositories. Pass arguments after a double dash, watch for changes with --watch, and run several tasks with --parallel.',
          ],
        },
        {
          kind: 'table',
          title: 'Detected project files and routed commands',
          columns: ['Project file', 'Command routed to'],
          rows: [
            [
              'package.json',
              'npm run dev, or the package manager named by the packageManager field or lockfile',
            ],
            ['Cargo.toml', 'cargo test'],
            ['Makefile', 'make build'],
            ['pyproject.toml', 'poetry run serve'],
            ['deno.json', 'deno task dev'],
          ],
        },
        {
          kind: 'commands',
          title: 'Examples',
          commands: [
            'omg run dev',
            'omg run test -- --verbose',
            'omg run build,test,lint --parallel',
          ],
        },
      ],
    },
    {
      id: 'environments',
      heading: 'Environments, tools, and projects',
      blocks: [
        {
          kind: 'commands',
          title: 'Environment lockfiles and snapshots',
          commands: [
            'omg env capture',
            'omg env check',
            'omg env sync <gist-url>',
            'omg snapshot create -m "Before major upgrade"',
            'omg snapshot restore abc123',
          ],
        },
        {
          kind: 'commands',
          title: 'Cross-ecosystem CLI tools and project templates',
          commands: [
            'omg tool install ripgrep',
            'omg tool registry',
            'omg new rust my-cli',
            'omg init --defaults',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg tool installs curated developer tools under the OMG data directory. The default is ~/.local/share/omg/tools on Linux and ~/Library/Application Support/omg/tools on macOS. omg new scaffolds Rust, React, Node.js, Python, and Go projects. omg init runs the first-run wizard.',
          ],
        },
      ],
    },
    {
      id: 'history',
      heading: 'History and rollback',
      blocks: [
        {
          kind: 'commands',
          title: 'Inspect and undo transactions',
          commands: [
            'omg history --limit 5',
            'omg history --search firefox',
            'omg rollback abc123',
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Official package rollback uses the local package cache. On Arch, AUR rollback rebuilds the historical AUR commit. Debian cannot restore AUR package changes. Pass --yes in non-interactive shells.',
        },
      ],
    },
    {
      id: 'services',
      heading: 'Daemon, dashboard, and CI',
      blocks: [
        {
          kind: 'commands',
          title: 'Background services and inspection',
          commands: [
            'omg daemon-status',
            'omg dash',
            'omg metrics',
            'omg ci init github',
            'omg ci cache',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg dash opens an interactive dashboard with search and view switching. daemon-status and metrics are available on Unix systems. omg ci generates CI configuration for GitHub, GitLab, and CircleCI. omg migrate exports and imports a portable manifest that maps package names between distributions.',
          ],
        },
      ],
    },
  ],
};
