/**
 * Curated troubleshooting handbook. Reviewed against the PyRo1121/omg implementation
 * and docs/troubleshooting.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const troubleshootingTopic: DocsTopic = {
  ...docsTopicMeta('troubleshooting'),
  sections: [
    {
      id: 'diagnostics',
      heading: 'Start with the built-in diagnostics',
      blocks: [
        {
          kind: 'commands',
          title: 'First commands to run',
          commands: ['omg doctor', 'omg status', 'omg --version'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg doctor checks connectivity, required tools, package-backend health, the daemon, PATH, and the shell hook. Add --network to test mirrors. Add --eol to flag end-of-life runtime versions. Most sections below start from these results.',
          ],
        },
      ],
    },
    {
      id: 'daemon',
      heading: 'Daemon problems',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Without the daemon, commands still work but fall back to direct package-manager queries, which are slower. Use omg daemon-status to inspect the daemon.',
          ],
        },
        {
          kind: 'steps',
          steps: [
            { text: 'Check whether the daemon responds.', command: 'omg daemon-status' },
            { text: 'Start it if needed.', command: 'omg daemon' },
            {
              text: 'Run omgd in the foreground to see startup errors. It removes stale sockets only after ownership checks.',
              command: 'omgd',
            },
            {
              text: 'If you use a systemd user service, inspect its recent log.',
              command: 'journalctl --user -u omgd -n 50',
            },
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Permission denied on the socket usually means XDG_RUNTIME_DIR or its socket has the wrong owner. Do not delete a socket owned by another user. Fix the directory ownership, then start the daemon as your own user.',
        },
      ],
    },
    {
      id: 'shell',
      heading: 'Shell hook and completions',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              text: 'Confirm the hook is installed in your profile.',
              command: 'grep "omg hook" ~/.zshrc',
            },
            {
              text: 'Reinstall it if missing.',
              command: 'echo \'eval "$(omg hook zsh)"\' >> ~/.zshrc',
            },
            {
              text: 'Restart the shell completely, not just re-source the profile.',
              command: 'exec zsh',
            },
            { text: 'Test the hook in a project with a version file.', command: 'omg which node' },
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'If the prompt feels slow, make sure the daemon is running so the hook avoids the slower fallback path, and prefer the cached prompt functions such as omg-ec over shelling out to full commands. For broken completions, regenerate them and rebuild the Zsh completion cache.',
          ],
        },
        {
          kind: 'commands',
          title: 'Regenerate completions',
          commands: ['omg completions zsh', 'rm -f ~/.zcompdump && compinit'],
        },
      ],
    },
    {
      id: 'packages',
      heading: 'Search, AUR builds, and policy blocks',
      blocks: [
        {
          kind: 'table',
          title: 'Package problems and first fixes',
          columns: ['Symptom', 'Fix'],
          rows: [
            [
              'Search returns nothing',
              'Refresh package databases with omg sync, then retry the search',
            ],
            [
              'AUR build fails',
              'Install base-devel, clear AUR build directories with omg clean --aur, and retry',
            ],
            [
              'Install blocked by policy',
              'Read the rule in the error and inspect the active policy with omg audit policy',
            ],
            [
              'Rollback fails',
              'The package cache lacks the old version; fetch it from the distribution archive',
            ],
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Policy rejections name the violated rule, such as a grade below minimum_grade or an AUR source that the policy disallows. Inspect policy.toml and the package source before deciding whether to change the policy.',
          ],
        },
        {
          kind: 'commands',
          title: 'AUR build recovery',
          commands: ['pacman -Q base-devel', 'omg clean --aur', 'omg install <package>'],
        },
      ],
    },
    {
      id: 'runtimes',
      heading: 'Runtime downloads and switching',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'When a version will not switch, an older manager often precedes the OMG path. Run which -a node to see every candidate in order. Remove stale PATH entries, run omg use again, then restart the shell with exec zsh.',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Download failures are usually network problems. Check proxy variables, connectivity to the runtime origin, and free space in the directory shown by omg config get data_dir. Unsupported runtime names fail by design. OMG does not install a fallback manager for them.',
          ],
        },
      ],
    },
    {
      id: 'cache',
      heading: 'Cache and history corruption',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              text: 'Restart the daemon to clear its in-memory search and package caches.',
              command: 'pkill -x omgd; omg daemon',
            },
            {
              text: 'If the status snapshot is corrupt, stop the daemon and move the snapshot aside before restarting.',
              command:
                'pkill -x omgd; data_dir="$(omg config get data_dir)"; mv "$data_dir/status-cache.json" "$data_dir/status-cache.json.bak"; omg daemon',
            },
            {
              text: 'OMG quarantines a corrupt transaction history automatically. Look for the preserved copy before further recovery.',
              command:
                'data_dir="$(omg config get data_dir)"; ls "$data_dir"/history.json.corrupt-*',
            },
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'If omg audit verify fails, back up the audit log instead of editing it. Editing a hash-chained log makes reconstruction harder; the backup preserves evidence.',
        },
      ],
    },
    {
      id: 'rollback',
      heading: 'Rollback limits',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Official package rollback uses the local package cache. If the old archive is missing, download the exact package from the distribution archive and let OMG validate it as a local file.',
          ],
        },
        {
          kind: 'commands',
          title: 'Install a downloaded Arch package',
          commands: ['omg install ./package.pkg.tar.zst --allow-local-file'],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'On Arch, AUR rollback rebuilds the historical commit recorded for the transaction. Debian cannot restore AUR package changes.',
        },
      ],
    },
    {
      id: 'reset',
      heading: 'Last-resort reset and bug reports',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              text: 'Use a full reset only after targeted recovery fails. Stop the daemon first.',
              command: 'pkill -x omgd',
            },
            {
              text: 'Print the data directory and review it before moving anything.',
              command: 'omg config get data_dir',
            },
            {
              text: 'Move the reviewed data directory aside instead of deleting it. On macOS this also moves configuration.',
              command: 'data_dir="$(omg config get data_dir)"; mv "$data_dir" "$data_dir.bak"',
            },
            {
              text: 'On Linux or WSL, move the separate configuration directory aside.',
              command: 'mv ~/.config/omg ~/.config/omg.bak',
            },
            {
              text: 'Start the daemon and confirm the clean state.',
              command: 'omg daemon && omg status',
            },
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'When reporting a problem, include four artifacts. Send the operating system release, omg --version, the output of omg doctor, and the failing command with its error output.',
          ],
        },
      ],
    },
  ],
};
