/**
 * Curated architecture handbook. Reviewed against the PyRo1121/omg implementation
 * and docs/architecture.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const architectureTopic: DocsTopic = {
  ...docsTopicMeta('architecture'),
  sections: [
    {
      id: 'binaries',
      heading: 'Three cooperating binaries',
      blocks: [
        {
          kind: 'table',
          title: 'The OMG binaries and their roles',
          columns: ['Binary', 'Role'],
          rows: [
            [
              'omg',
              'The CLI handles arguments, package operations, policy, output, and interactive views',
            ],
            [
              'omgd',
              'The daemon maintains an in-memory package index, background status scans, and caches',
            ],
            [
              'omg-fast',
              'The prompt helper reads count snapshots directly and uses IPC for search, package info, or stale snapshot fallback',
            ],
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The CLI talks to the daemon over a Unix socket. The daemon keeps hot derived data in memory and writes status snapshots to disk. omg-fast reads the fixed-size snapshot for prompt counts. Its search and package-info modes use the socket.',
          ],
        },
      ],
    },
    {
      id: 'search-flow',
      heading: 'What happens on a search',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'The CLI parses the query and uses the daemon when it is available.' },
            { text: 'The daemon checks its in-memory response cache.' },
            { text: 'On a cache miss, the daemon searches its in-memory package index.' },
            { text: 'The daemon caches the result and returns it to the CLI.' },
            {
              text: 'If the daemon is unavailable, the CLI queries package backends directly. On Arch it can query official repositories and the AUR in parallel.',
            },
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'On Arch, OMG binds libalpm through direct FFI instead of invoking pacman for queries. Debian reads the native package database. Fedora and RHEL read RPM SQLite data directly, with rpm -qa as a fallback for BDB or NDB databases. AUR requests use HTTPS.',
          ],
        },
      ],
    },
    {
      id: 'runtime-flow',
      heading: 'What happens on a runtime switch',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              text: 'The CLI detects the runtime type and checks whether the requested version is installed.',
            },
            { text: 'If not, it downloads the release from the official origin and verifies it.' },
            {
              text: 'The version is extracted under versions/runtime/version in the OMG data directory.',
            },
            {
              text: 'The current symlink records the selected version. When a project pin exists, the shell hook prepends that concrete version directory to PATH.',
            },
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Unknown runtime names fail explicitly. OMG does not invoke or download another version manager. A Node project pin can reuse a matching binary from an existing nvm directory. Pi installs through npm with lifecycle scripts disabled.',
        },
      ],
    },
    {
      id: 'caching',
      heading: 'Cache tiers',
      blocks: [
        {
          kind: 'table',
          title: 'From hottest to most durable',
          columns: ['Tier', 'What it holds'],
          rows: [
            [
              'In-memory',
              'Recent searches, package details, and system status shared by all CLI instances',
            ],
            [
              'Status snapshots',
              'Versioned JSON persisted with atomic writes for quick status and history-independent cache state',
            ],
            [
              'Binary status file',
              'Fixed-size package counts read directly by omg-fast, with IPC fallback when the snapshot is stale or missing',
            ],
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Search indexes are rebuilt from the native package-manager databases rather than treated as durable authority, so deleting the persistent cache is always safe. Transaction history, audit logs, and runtime artifacts remain separate from status snapshots. Snapshots are written with a same-directory temporary file, fsync, and atomic rename.',
          ],
        },
      ],
    },
    {
      id: 'ipc',
      heading: 'IPC protocol',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Transport is a Unix domain socket with length-delimited framing.',
            'Messages use a compact binary serialization format chosen for low latency.',
            'Requests cover search, package info, system status, security audits, explicit package listings, and cache or health controls.',
            'Cached responses return quickly. A daemon search cache miss reads the in-memory index rather than querying a package backend.',
            'Without a running daemon, the CLI falls back to direct package-manager queries instead of failing.',
          ],
        },
      ],
    },
    {
      id: 'security-pipeline',
      heading: 'Security paths',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'Runtime and self-update downloads verify expected SHA-256 digests.' },
            { text: 'AUR key preparation uses gpg to inspect and import required keys.' },
            {
              text: 'omg audit slsa verifies Sigstore hashedrekord signatures and Rekor inclusion. It does not establish build provenance.',
            },
            { text: 'omg audit queries OSV.dev. Daemon status scans use Arch Linux advisories.' },
            {
              text: 'Package installs and Arch updates apply policy.toml checks and report rejected rules.',
            },
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Runtime operations stay inside the user data directory. System package operations can elevate through sudo when the native backend requires it. Sensitive writes use atomic replacement where implemented, and audited security events are appended to a hash-chained log.',
          ],
        },
      ],
    },
    {
      id: 'workers',
      heading: 'Background workers and shutdown',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'A status refresh worker probes runtime versions, counts vulnerabilities, updates caches, and rewrites the binary status file and JSON snapshot.',
            'An optional ALSA scanner periodically fetches Arch security advisories and matches them against installed packages.',
            'On SIGINT or SIGTERM the daemon stops accepting connections, lets active requests finish, stops workers, and cleans up the socket.',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Because workers only maintain derived state, killing the daemon never corrupts package operations. Restart it with omg daemon and the caches repopulate on demand.',
          ],
        },
      ],
    },
  ],
};
