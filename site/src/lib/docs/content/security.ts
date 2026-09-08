/**
 * Curated security handbook. Reviewed against the PyRo1121/omg implementation and
 * docs/security.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const securityTopic: DocsTopic = {
  ...docsTopicMeta('security'),
  sections: [
    {
      id: 'grades',
      heading: 'Security grades',
      blocks: [
        {
          kind: 'table',
          title: 'How OMG classifies packages',
          columns: ['Grade', 'Classification'],
          rows: [
            ['Locked', 'Reserved for provenance evidence. Automatic grading does not assign it'],
            ['Verified', 'Official repository metadata identifies the package'],
            ['Community', 'AUR and other nonofficial package sources'],
            ['Risk', 'The configured vulnerability scanner found a known vulnerability'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The grade order is Risk, Community, Verified, then Locked. Current automatic grading returns Risk, Community, or Verified. A package name alone never grants Locked status.',
        },
      ],
    },
    {
      id: 'scanning',
      heading: 'Vulnerability scanning',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg audit and omg audit scan query OSV.dev for installed packages with a fixed concurrency limit. Results stay in a process-local cache for ten minutes. Reports count findings with CVSS 7.0 and above as high severity. The daemon uses Arch Linux security advisories for its separate system-status scan.',
          ],
        },
        {
          kind: 'commands',
          title: 'Scan and report',
          commands: [
            'omg audit',
            'omg audit scan',
            'omg audit log --severity error',
            'omg audit eol',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'OSV requests use the shared HTTP client with a five-second connection timeout and a fifteen-second total timeout. The vulnerability scanner does not retry a failed request.',
        },
      ],
    },
    {
      id: 'verification',
      heading: 'Signature and provenance verification',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Runtime installers and self-update compare downloaded bytes with the expected SHA-256 digest when that digest is available.',
            'AUR key preparation invokes gpg to inspect and import keys required by a build.',
            'omg audit slsa verifies a Sigstore hashedrekord signature and its Rekor log inclusion.',
            'The current hashedrekord check does not establish build provenance or assign a SLSA level. It is a standalone audit and does not gate installation.',
          ],
        },
        {
          kind: 'commands',
          title: 'Check provenance directly',
          commands: ['omg audit slsa artifacts/package.pkg.tar.zst'],
        },
      ],
    },
    {
      id: 'policy',
      heading: 'Policy enforcement',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'policy.toml is checked for package installs and Arch updates. A package is rejected when its grade is below minimum_grade, when AUR sources are disallowed, when require_pgp demands a grade below Verified, when its license is outside allowed_licenses, or when it appears in banned_packages. Rejections identify the rule that failed.',
          ],
        },
        {
          kind: 'commands',
          title: 'Inspect the active policy',
          commands: ['omg audit policy'],
        },
      ],
    },
    {
      id: 'sbom',
      heading: 'SBOM generation and compliance',
      blocks: [
        {
          kind: 'commands',
          title: 'Generate and export evidence',
          commands: [
            'omg audit sbom -o sbom.json',
            'omg audit log --export audit.csv',
            'omg enterprise audit-export --framework soc2 --period 2026-Q1',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The CLI writes a CycloneDX 1.5 SBOM with PURL identifiers, package versions, and vulnerability data. Enterprise audit export is a separate command. It accepts soc2, iso27001, fedramp, hipaa, and pci-dss framework labels.',
          ],
        },
      ],
    },
    {
      id: 'secrets',
      heading: 'Secret scanning',
      blocks: [
        {
          kind: 'table',
          title: 'Detected credential families',
          columns: ['Credential type', 'Severity'],
          rows: [
            ['AWS access and secret keys', 'Critical'],
            ['GitHub and GitLab tokens', 'Critical'],
            ['Private keys', 'Critical'],
            ['Stripe live keys', 'Critical'],
            ['Slack tokens and Google API keys', 'High'],
            ['NPM tokens', 'High'],
            ['JWT and generic API keys or passwords', 'Medium'],
          ],
        },
        {
          kind: 'commands',
          title: 'Scan a project',
          commands: ['omg audit secrets', 'omg audit secrets -p /path/to/project'],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The scanner skips placeholder-shaped values such as your_api_key_here, example_token, and template variables. Markdown and text files are still scanned, so realistic example credentials can trigger findings.',
        },
      ],
    },
    {
      id: 'audit-log',
      heading: 'Tamper-evident audit log',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Package changes, security scan summaries, policy rejections, and daemon lifecycle events are appended to audit/audit.jsonl under the OMG data directory. Editing a retained entry breaks its hash chain. The local chain cannot prove that an attacker with filesystem access did not delete or truncate entries.',
          ],
        },
        {
          kind: 'commands',
          title: 'Review and prove integrity',
          commands: ['omg audit log --limit 50', 'omg audit verify'],
        },
      ],
    },
    {
      id: 'telemetry',
      heading: 'Telemetry is opt-in',
      blocks: [
        {
          kind: 'bullets',
          items: [
            'Runtime telemetry is disabled by default and activates only after you explicitly enable it.',
            'Installer tracking asks for consent, defaults to no, and can be skipped permanently with OMG_NO_TELEMETRY=1.',
            'At runtime, OMG_TELEMETRY=0 or OMG_DISABLE_TELEMETRY=1 also disables collection.',
            'Collected telemetry never includes package names, search queries, file paths, arguments, or error output.',
            'Events are queued locally in your data directory and sent only over HTTPS, and network failures never fail the command you ran.',
          ],
        },
        {
          kind: 'commands',
          title: 'Manage telemetry and export local data',
          commands: ['omg privacy status', 'omg privacy opt-out', 'omg privacy export'],
        },
      ],
    },
  ],
};
