/**
 * Curated configuration handbook. Reviewed against the PyRo1121/omg implementation
 * and docs/configuration.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const configurationTopic: DocsTopic = {
  ...docsTopicMeta('configuration'),
  sections: [
    {
      id: 'locations',
      heading: 'File locations',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'On Linux, OMG follows the XDG base directory specification. macOS uses its Application Support directory. An empty configuration is valid. Every setting has a default, so most machines need no configuration.',
          ],
        },
        {
          kind: 'table',
          title: 'Linux and WSL default paths',
          columns: ['Path', 'Purpose'],
          rows: [
            [
              '~/.config/omg/config.toml',
              'General settings such as telemetry and AUR build tuning',
            ],
            ['~/.config/omg/policy.toml', 'Security policy for what may be installed'],
            ['~/.local/share/omg/versions/', 'Installed runtime versions'],
            ['~/.local/share/omg/tools/', 'CLI tools installed with omg tool'],
            ['~/.local/share/omg/status-cache.json', 'Versioned daemon status snapshot'],
            ['~/.local/share/omg/completion-cache.json', 'Shell completion cache'],
            ['~/.local/share/omg/history.json', 'Transaction history'],
            ['~/.local/share/omg/audit/audit.jsonl', 'Hash-chained audit log'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The table shows Linux and WSL defaults. On macOS, data and configuration default to ~/Library/Application Support/omg. XDG data and config variables apply on Linux. OMG_DATA_DIR, OMG_CONFIG_DIR, and OMG_SOCKET_PATH override paths on every platform.',
        },
      ],
    },
    {
      id: 'config-toml',
      heading: 'General settings in config.toml',
      blocks: [
        {
          kind: 'commands',
          title: 'Developer workstation example',
          commands: [
            'telemetry_enabled = false',
            '',
            '[aur]',
            'build_concurrency = 16',
            'enable_ccache = true',
            'cache_builds = true',
          ],
        },
        {
          kind: 'table',
          title: 'AUR build settings and defaults',
          columns: ['Setting', 'Default and meaning'],
          rows: [
            ['build_method', '"bubblewrap" by default; alternatives are "chroot" and "native"'],
            ['build_concurrency', 'CPU count by default; parallel AUR builds'],
            [
              'review_pkgbuild',
              'true by default; requires interactive PKGBUILD review before building',
            ],
            ['secure_makepkg', 'true by default; uses stricter makepkg flags'],
            ['allow_unsafe_builds', 'false by default; permits native builds without sandboxing'],
            ['use_metadata_archive', 'true by default; bulk AUR metadata for fast update checks'],
            ['cache_builds', 'true by default; reuses built packages'],
            ['enable_ccache', 'false by default; speeds up C and C++ builds'],
            ['enable_sccache', 'false by default; speeds up Rust builds'],
            ['telemetry_enabled', 'false by default; runtime telemetry is strictly opt-in'],
          ],
        },
        {
          kind: 'commands',
          title: 'Read and change settings from the CLI',
          commands: [
            'omg config list',
            'omg config get data_dir',
            'omg config set aur.build_concurrency 8',
            'omg config set telemetry.enabled false',
            'omg config validate',
          ],
        },
      ],
    },
    {
      id: 'policy-toml',
      heading: 'Security policy in policy.toml',
      blocks: [
        {
          kind: 'table',
          title: 'Security grades from lowest to highest',
          columns: ['Grade', 'Meaning'],
          rows: [
            ['Risk', 'The configured vulnerability scanner found a known vulnerability'],
            ['Community', 'AUR or another nonofficial package source'],
            ['Verified', 'Official repository metadata identifies the package'],
            [
              'Locked',
              'Reserved for provenance evidence that automatic grading does not yet assign',
            ],
          ],
        },
        {
          kind: 'steps',
          steps: [
            { text: 'Package grading. Every candidate gets a grade from the table above.' },
            { text: 'Grade check. The grade must meet minimum_grade.' },
            { text: 'AUR check. AUR packages are rejected when allow_aur is false.' },
            { text: 'Trust check. Grades below Verified are rejected when require_pgp is true.' },
            {
              text: 'License check. Licenses outside allowed_licenses are rejected when the list is set.',
            },
            { text: 'Ban check. Packages in banned_packages are always rejected.' },
          ],
        },
        {
          kind: 'commands',
          title: 'Corporate style policy',
          commands: [
            'minimum_grade = "Verified"',
            'allow_aur = false',
            'require_pgp = true',
            'allowed_licenses = ["Apache-2.0", "MIT", "BSD-3-Clause"]',
            'banned_packages = []',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The default policy uses a minimum_grade of Community. It allows AUR packages and does not require the Verified grade. Tighten minimum_grade, allow_aur, require_pgp, allowed_licenses, and banned_packages when the machine needs stricter controls.',
          ],
        },
      ],
    },
    {
      id: 'version-files',
      heading: 'Version files OMG reads',
      blocks: [
        {
          kind: 'table',
          title: 'Detected version files',
          columns: ['File', 'Runtime'],
          rows: [
            ['.nvmrc', 'Node.js'],
            ['.node-version', 'Node.js'],
            ['.bun-version', 'Bun'],
            ['.python-version', 'Python'],
            ['.ruby-version', 'Ruby'],
            ['.go-version', 'Go'],
            ['.java-version', 'Java'],
            ['rust-toolchain', 'Rust'],
            ['rust-toolchain.toml', 'Rust'],
            ['.tool-versions', 'Multiple runtimes in asdf format'],
            ['package.json', 'Node.js and Bun through the engines or volta field'],
            ['go.mod', 'Go through the go directive'],
          ],
        },
        {
          kind: 'commands',
          title: 'Rust toolchain file format',
          commands: [
            '[toolchain]',
            'channel = "stable"',
            'components = ["rustfmt", "clippy"]',
            'profile = "minimal"',
          ],
        },
      ],
    },
    {
      id: 'environment-variables',
      heading: 'Environment variables',
      blocks: [
        {
          kind: 'table',
          title: 'Variables OMG respects',
          columns: ['Variable', 'Purpose'],
          rows: [
            ['OMG_SOCKET_PATH', 'Override the daemon socket path'],
            ['OMG_DATA_DIR', 'Override the data directory'],
            ['OMG_CONFIG_DIR', 'Override the configuration directory'],
            [
              'RUST_LOG',
              'Logging filter. The CLI defaults to warn and the daemon defaults to info',
            ],
            ['GITHUB_TOKEN', 'Required by omg env share'],
            [
              'XDG_RUNTIME_DIR',
              'Linux socket directory. Falls back to /run/user/$UID or a private /tmp/omg-$UID directory',
            ],
            ['XDG_DATA_HOME', 'Linux data directory. The default is ~/.local/share'],
            ['XDG_CONFIG_HOME', 'Linux configuration directory. The default is ~/.config'],
          ],
        },
      ],
    },
    {
      id: 'daemon-service',
      heading: 'Running the daemon with systemd',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'The daemon omgd is optional. Without it, the CLI falls back to direct package-manager queries. On Linux, a systemd user unit can keep it running across logins.',
          ],
        },
        {
          kind: 'steps',
          steps: [
            {
              text: 'Create ~/.config/systemd/user/omgd.service with ExecStart pointing at %h/.local/bin/omgd and Restart=on-failure.',
            },
            {
              text: 'Enable and start the unit.',
              command: 'systemctl --user enable omgd && systemctl --user start omgd',
            },
            { text: 'Check the result.', command: 'omg daemon-status' },
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'There is no config switch to disable the daemon. Simply do not start omgd on machines where you do not want it.',
        },
      ],
    },
    {
      id: 'problems',
      heading: 'When configuration misbehaves',
      blocks: [
        {
          kind: 'table',
          title: 'Common configuration problems',
          columns: ['Symptom', 'Fix'],
          rows: [
            [
              'Config not loading',
              'Check the file path and TOML syntax, then run omg config validate',
            ],
            [
              'Permission denied',
              'Ensure the socket and data directories are writable by your user',
            ],
            [
              'Policy blocks installs',
              'Raise or lower minimum_grade, or adjust allow_aur and require_pgp',
            ],
            [
              'Runtime not found',
              'Use one of the documented native runtime names, such as node or python',
            ],
          ],
        },
        {
          kind: 'commands',
          title: 'Back up Linux or WSL configuration and reset',
          commands: [
            'mv ~/.config/omg/config.toml ~/.config/omg/config.toml.bak',
            'mv ~/.config/omg/policy.toml ~/.config/omg/policy.toml.bak',
            'omg config validate',
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'On macOS, configuration and runtime data share ~/Library/Application Support/omg. Moving that directory resets both. Back it up before making changes.',
        },
      ],
    },
  ],
};
