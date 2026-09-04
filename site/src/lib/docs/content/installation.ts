/**
 * Curated installation handbook. Reviewed against the PyRo1121/omg implementation
 * and docs/installation.md at the commit recorded in the topic registry.
 */
import { SITE_ORIGIN } from '../../../../../shared/public-site';
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const installationTopic: DocsTopic = {
  ...docsTopicMeta('installation'),
  sections: [
    {
      id: 'installer',
      heading: 'Install with the universal installer',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'The universal installer detects your operating system and package backend, downloads the matching release binaries, and installs them to ~/.local/bin. Inspect the script before piping it to your shell.',
          ],
        },
        {
          kind: 'commands',
          title: 'Linux and macOS, including WSL',
          commands: [`curl -fsSL ${SITE_ORIGIN}/install.sh | bash`],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Native Windows is not supported. Run the same installer inside a WSL distribution, and OMG will use the package backend of that distribution.',
        },
      ],
    },
    {
      id: 'platforms',
      heading: 'Platform packages',
      blocks: [
        {
          kind: 'table',
          title: 'Supported platforms and install methods',
          columns: ['Platform', 'Install method'],
          rows: [
            [
              'Arch Linux',
              'Run yay -S omg-bin for the prebuilt binary, or yay -S omg to build from source',
            ],
            [
              'Debian and Ubuntu',
              'Universal installer, or download a release tarball and copy the binary to /usr/local/bin',
            ],
            ['Fedora and RHEL', 'Universal installer'],
            ['macOS', 'Universal installer. Homebrew packaging is not available yet'],
            ['Windows', 'WSL only, using the universal installer inside the distribution'],
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Release binaries support x86_64 Linux and Apple Silicon macOS. Intel macOS and native Windows are unsupported. Source builds require Rust 1.93.1 and the platform toolchain. Arch builds also link libarchive and OpenSSL. Debian builds need libapt-pkg-dev, Clang, and CMake.',
          ],
        },
        {
          kind: 'commands',
          title: 'Build and install from source',
          commands: [
            'cargo install omg --git https://github.com/PyRo1121/omg --locked',
            'omg --version',
          ],
        },
      ],
    },
    {
      id: 'setup',
      heading: 'Shell integration and first checks',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              text: 'Enable the shell hook so runtime versions switch when you change directories.',
              command: 'echo \'eval "$(omg hook bash)"\' >> ~/.bashrc',
            },
            {
              text: 'For Zsh, add the same hook to ~/.zshrc. For Fish, add omg hook fish | source to ~/.config/fish/config.fish.',
            },
            { text: 'Verify the installation.', command: 'omg --version && omg doctor' },
            {
              text: 'Optionally install completions for your shell.',
              command: 'omg completions zsh',
            },
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'omg doctor checks connectivity, required tools, package-backend health, the daemon, PATH, and the shell hook. Add --network to test mirrors. Add --eol to find end-of-life runtimes.',
        },
      ],
    },
    {
      id: 'options',
      heading: 'Installer options',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'The installer reads environment variables. Put them on the bash side of the pipe, not in front of curl, so they reach the installer process.',
          ],
        },
        {
          kind: 'table',
          title: 'Installer environment variables',
          columns: ['Variable', 'Effect'],
          rows: [
            ['OMG_NO_TELEMETRY=1', 'Skip the telemetry consent prompt and keep telemetry disabled'],
            ['OMG_SKIP_SHELL=1', 'Skip shell integration setup'],
            ['OMG_VERSION=v0.1.215', 'Install a specific release'],
            ['INSTALL_DIR=~/.omg/bin', 'Install to a custom directory'],
          ],
        },
        {
          kind: 'commands',
          title: 'Combine options in one command',
          commands: [
            `curl -fsSL ${SITE_ORIGIN}/install.sh | OMG_NO_TELEMETRY=1 OMG_SKIP_SHELL=1 bash`,
          ],
        },
      ],
    },
    {
      id: 'updating',
      heading: 'Updating and uninstalling',
      blocks: [
        {
          kind: 'commands',
          title: 'Update OMG itself',
          commands: [
            'omg self-update',
            'yay -Syu omg-bin',
            'cargo install omg --git https://github.com/PyRo1121/omg --locked --force',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg self-update replaces the binary atomically and verifies the download before installing it. AUR installs update through the AUR helper, and Cargo installs update by rerunning cargo install with --force.',
          ],
        },
        {
          kind: 'commands',
          title: 'Remove installer-managed binaries',
          commands: ['rm -f ~/.local/bin/omg ~/.local/bin/omgd'],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'On Linux and WSL, removing ~/.local/share/omg or ~/.config/omg deletes installed runtimes, tools, history, policy, and settings. On macOS, data and configuration default to ~/Library/Application Support/omg. Back up state before deleting it.',
        },
      ],
    },
    {
      id: 'path-problems',
      heading: 'If the command is not found',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'The installer places the binary in ~/.local/bin. If that directory is missing from PATH, add it and restart the shell. If the binary exists but will not run, restore its execute permission.',
          ],
        },
        {
          kind: 'commands',
          title: 'Fix PATH and permissions',
          commands: [
            'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.bashrc',
            'chmod +x ~/.local/bin/omg',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'For CI pipelines, install OMG in a setup step, add ~/.local/bin to PATH, then select the runtime your build needs, for example omg use node 20 followed by omg run build.',
          ],
        },
      ],
    },
  ],
};
