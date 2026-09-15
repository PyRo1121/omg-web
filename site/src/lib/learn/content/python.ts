import type { LearningContent } from '../page';

export const content: LearningContent = {
  sections: [
    {
      id: 'layers',
      heading: 'Select Python, then isolate project dependencies',
      blocks: [
        {
          kind: 'paragraphs',
          paragraphs: [
            'OMG selects the Python runtime. A virtual environment isolates the libraries a project installs. These are separate layers: changing a runtime does not recreate an existing virtual environment.',
            'Install OMG and its shell integration on supported Linux, Apple Silicon macOS, or WSL. Keep distribution-managed Python available for operating-system tools; do not replace it globally with an application environment.',
          ],
        },
      ],
    },
    {
      id: 'runtime',
      heading: 'Install and inspect Python',
      blocks: [
        {
          kind: 'commands',
          title: 'Install and inspect a Python release',
          commands: ['omg use python 3.12', 'omg list python', 'omg which python'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'The version is an example, not a recommendation to change a project that requires another release. In a new project, create .python-version containing the exact installed release reported by omg list python. Keep an existing project’s requirement and install that release instead. The shell hook needs a matching project pin to put the runtime on PATH; omg use alone does not change an unpinned shell.',
            'The reviewed hook checks .python-version, pyproject.toml, then .tool-versions. Allow the hook to run at a new prompt and compare which -a python3 and python3 --version with omg which python before creating the environment.',
          ],
        },
      ],
    },
    {
      id: 'venv',
      heading: 'Create a virtual environment for the selected interpreter',
      blocks: [
        {
          kind: 'commands',
          title: 'Create an environment and invoke its interpreter explicitly',
          commands: [
            'python3 -m venv .venv',
            '.venv/bin/python --version',
            '.venv/bin/python -m pip --version',
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'The reviewed OMG Bash and Zsh hooks restore their saved base PATH at each prompt. Activating a virtual environment can therefore lose its PATH priority. Use .venv/bin/python and .venv/bin/python -m pip explicitly instead of relying on activation while that hook is enabled.',
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'Use the environment’s explicit interpreter path when installing dependencies according to the repository documentation and its selected locking tool. A virtual environment alone does not lock dependency versions.',
            'When changing Python versions, create a fresh virtual environment following the project instructions. Do not assume an existing .venv has switched interpreters because the project pin changed.',
          ],
        },
      ],
    },
    {
      id: 'diagnose',
      heading: 'Diagnose an unexpected interpreter',
      blocks: [
        {
          kind: 'commands',
          title: 'Check runtime and environment selection',
          commands: ['omg which python', 'which -a python3', 'python3 --version'],
        },
        {
          kind: 'paragraphs',
          paragraphs: [
            'An active virtual environment or another tool manager may intentionally take priority. Compare the selected interpreter with the project requirements before editing PATH or your shell profile.',
            'These commands are source-reviewed guidance. Python builds, optional native libraries, shell configuration, and dependency installation need validation on your own supported platform.',
          ],
        },
      ],
    },
  ],
  sources: [
    { title: 'OMG runtime handbook and source provenance', href: '/docs/runtimes/' },
    {
      title: 'Python virtual environment documentation',
      href: 'https://docs.python.org/3/library/venv.html',
    },
  ],
  related: ['/guides/reproducible-dev-environments/', '/docs/troubleshooting/', '/runtimes/node/'],
};
