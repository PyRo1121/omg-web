import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'summary',
      heading: 'Start with the workflow you need',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'OMG brings supported system package operations, language runtime selection, and environment capture/check workflows into one CLI. mise manages development tools and runtimes, environment variables, and tasks. Both can help a developer maintain multiple projects.',
            'This comparison was reviewed on September 14, 2026 against the linked documentation. It is a feature and workflow comparison, not an independently executed speed benchmark. OMG is alpha software; validate the commands and platform support your projects need before changing their toolchain.',
          ],
        },
      ],
    },
    {
      id: 'differences',
      heading: 'Compare the responsibilities',
      blocks: [
        {
          kind: 'table',
          title: 'Documented behavior and tradeoffs',
          columns: ['Area', 'OMG and mise'],
          rows: [
            [
              'System package operations',
              'OMG exposes supported native system-package backends through its CLI. mise describes its core as development tools, environment variables, and tasks; compare your actual system-package workflow rather than treating every tool download as an OS package transaction.',
            ],
            [
              'Language runtimes',
              'Both manage multiple languages. Check each tool’s current registry and installation support for the runtime and platform you need.',
            ],
            [
              'Project version files',
              'The reviewed OMG hook checks files such as .node-version and .nvmrc. mise supports idiomatic files too, with explicit configuration described in its Node guide.',
            ],
            [
              'npm versions',
              'OMG’s Node installation provides the npm bundled with Node. mise documents independent npm pinning alongside Node.',
            ],
            [
              'Environment workflows',
              'OMG documents capture, check, and sharing/sync commands. mise documents environment configuration and task execution. These workflows overlap in purpose but are not identical operations.',
            ],
            [
              'Platform choice',
              'OMG’s installer targets supported Linux and Apple Silicon macOS; Windows usage is through WSL. Review mise’s own platform documentation for your setup.',
            ],
          ],
        },
      ],
    },
    {
      id: 'choose',
      heading: 'When each tool is worth evaluating',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'Evaluate OMG when a consistent interface for supported system packages and runtimes is central to your workflow, or when you want to try its environment capture and drift checks.',
            'Evaluate mise when you want its development-tool registry, task runner, environment configuration, or documented npm pinning. A working mise setup is a reason to compare carefully, not an automatic reason to migrate.',
            'For either tool, use a representative project and verify shell startup, directory switching, CI, dependency installation, and recovery. List the specific integrations your team relies on.',
          ],
        },
      ],
    },
    {
      id: 'evidence',
      heading: 'Keep performance claims tied to the operation',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'OMG’s homepage links a recorded Arch Linux package-search benchmark against pacman. It does not establish faster JavaScript execution, faster npm installs, or an overall speed advantage over mise.',
            'A fair benchmark would state the tools and versions, machine, operating system, cache conditions, exact commands, repetitions, and raw results. No OMG-versus-mise speed claim is made on this page.',
          ],
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG runtime handbook', href: '/docs/runtimes/' },
    { title: 'OMG architecture and backend model', href: '/docs/architecture/' },
    { title: 'mise development tools', href: 'https://mise.jdx.dev/dev-tools/' },
    { title: 'mise Node.js and npm configuration', href: 'https://mise.jdx.dev/lang/node.html' },
    { title: 'mise environments', href: 'https://mise.jdx.dev/environments/' },
    { title: 'mise tasks', href: 'https://mise.jdx.dev/tasks/' },
  ],
  related: [
    '/guides/migrate-from-nvm/',
    '/guides/reproducible-dev-environments/',
    '/runtimes/node/',
  ],
};
