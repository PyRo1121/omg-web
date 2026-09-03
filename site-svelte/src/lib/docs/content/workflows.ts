/**
 * Curated workflows handbook. Reviewed against the PyRo1121/omg implementation and
 * docs/workflows.md at the commit recorded in the topic registry.
 */
import type { DocsTopic } from '../topic';
import { docsTopicMeta } from '../topics';

export const workflowsTopic: DocsTopic = {
  ...docsTopicMeta('workflows'),
  sections: [
    {
      id: 'daily',
      heading: 'A daily development loop',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'Start the day with a system check.', command: 'omg status' },
            { text: 'Apply available updates when you are ready.', command: 'omg update' },
            {
              text: 'Change into a project. The shell hook reads version files and switches runtimes automatically.',
            },
            {
              text: 'Run project tasks without knowing the ecosystem tool.',
              command: 'omg run dev',
            },
            { text: 'Record the day at a natural stopping point.', command: 'omg env capture' },
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'omg env capture writes the current package and runtime state to omg.lock. Commit that file with your project so machines stay comparable, and run omg env check whenever something feels off.',
          ],
        },
      ],
    },
    {
      id: 'team',
      heading: 'Team onboarding',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'The team lead pins versions in version files and captures omg.lock.' },
            {
              text: 'Commit the lockfile and version files to the repository.',
              command: 'git add omg.lock .nvmrc .python-version',
            },
            {
              text: 'A new member installs OMG and the shell hook, clones the project, and verifies the machine against the lock.',
              command: 'omg env check',
            },
            {
              text: 'Differences are visible immediately; fix them before running the project.',
              command: 'omg run dev',
            },
          ],
        },
        {
          kind: 'commands',
          title: 'Keeping a team in sync',
          commands: [
            'omg team init mycompany/frontend',
            'omg team pull',
            'omg env capture',
            'omg team push',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'omg env share publishes the lockfile as a GitHub Gist and needs GITHUB_TOKEN. Teammates restore it with omg env sync followed by the Gist URL.',
        },
      ],
    },
    {
      id: 'ci',
      heading: 'CI and container pipelines',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { text: 'Install OMG in a setup step and add ~/.local/bin to PATH.' },
            {
              text: 'Fail fast when the runner does not match the committed lockfile.',
              command: 'omg env check',
            },
            { text: 'Run tasks through the task runner.', command: 'omg run test' },
            {
              text: 'Print the recommended Linux cache paths and lockfile-based key, then copy them into your CI provider cache step.',
              command: 'omg ci cache',
            },
          ],
        },
        {
          kind: 'commands',
          title: 'Generate CI configuration',
          commands: ['omg ci init github', 'omg ci init gitlab', 'omg ci validate'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'In Docker images, install OMG in a RUN step, copy the project including omg.lock, and run omg env check before building. For non-interactive shells, pass --yes to commands that would prompt.',
          ],
        },
      ],
    },
    {
      id: 'security-routine',
      heading: 'A practical security routine',
      blocks: [
        {
          kind: 'commands',
          title: 'Weekly compliance check',
          commands: [
            'omg audit',
            'omg audit secrets -p .',
            'omg audit sbom -o sbom.json',
            'omg audit verify',
          ],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The vulnerability scan covers installed packages. The secret scan covers your project directory. The SBOM records installed packages and known vulnerabilities. audit verify detects changes within the retained log, but filesystem access can still delete or truncate entries. Review findings before updating packages.',
          ],
        },
      ],
    },
    {
      id: 'maintenance',
      heading: 'System maintenance',
      blocks: [
        {
          kind: 'commands',
          title: 'Weekly maintenance',
          commands: ['omg update', 'omg clean --orphans', 'omg clean --cache', 'omg doctor'],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'There is no CLI command that removes installed runtime versions. Switch away from a version before deleting it from the versions tree under the OMG data directory, then confirm the result with omg list.',
        },
        {
          kind: 'steps',
          steps: [
            {
              text: 'Before a major upgrade, create a restoration point.',
              command: 'omg snapshot create -m "Before upgrade"',
            },
            {
              text: 'Review recent transactions if anything looks wrong.',
              command: 'omg history --limit 20',
            },
            {
              text: 'Roll back the last transaction if the upgrade misbehaves.',
              command: 'omg rollback',
            },
          ],
        },
      ],
    },
    {
      id: 'prompt',
      heading: 'Monitoring from the shell prompt',
      blocks: [
        {
          kind: 'commands',
          title: 'Prompt helper functions on Zsh',
          commands: ['omg-ec', 'omg-uc'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The shell hook provides cached count functions for prompts. omg-ec shows explicit packages, omg-tc shows all packages, omg-oc shows orphans, and omg-uc shows available updates. They read the daemon binary status snapshot, so they are safe to call on every prompt render. Run omg dash for a full-screen view.',
          ],
        },
      ],
    },
  ],
};
