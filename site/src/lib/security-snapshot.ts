import type { SecurityFeed } from './security-updates';

// Committed fallback; live GitHub updates are added by the server feed.
export const SECURITY_SNAPSHOT: SecurityFeed = {
  updates: [
    {
      sha: 'b76bf0c736c047edbda55747b77fbf4a0f6c2fca',
      repository: 'omg',
      title: 'enforce tool privileges without unsafe',
      detail:
        'The Linux installer privilege restriction is applied through a safe process-launch path, removing the custom unsafe pre-execution block.',
      date: '2026-09-13T19:02:06-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '35923ad41ca8b349d2470e259ac58e6885154b8f',
      repository: 'omg',
      title: 'deny installer privilege gains',
      detail:
        'Managed installers receive closed standard input and Linux no_new_privs, limiting privilege gains through executable setuid, setgid and file capabilities.',
      date: '2026-09-13T18:40:06-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '8bb84cbcc5b6065ca957f94f5ae702ba4ccb6235',
      repository: 'omg',
      title: 'hash managed tool entrypoints',
      detail:
        'Security receipts include streaming SHA-256 hashes of published executable and script targets, using paths relative to the installation.',
      date: '2026-09-13T18:35:49-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '8e44e9244e9ba0b51e3d3780a503b24bb49a3f9b',
      repository: 'omg',
      title: 'roll back failed tool activation',
      detail:
        'The previous managed-tool directory is retained through activation. Failed command linking triggers restoration and cleanup of broken links from the failed version.',
      date: '2026-09-13T18:34:49-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: 'a246f42393d943a390c378776247631c26bd9e36',
      repository: 'omg',
      title: 'contain managed tool binary links',
      detail:
        'Tool binary entries are resolved and checked against their installation directory before activation and again when shared command links are created.',
      date: '2026-09-13T18:27:29-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '1fc5d2a801cab56a50731030951ea4b4973c01b1',
      repository: 'omg',
      title: 'record managed tool policy receipts',
      detail:
        'Each managed installation stores a security receipt describing its source policy, active exceptions and effective verification and build settings.',
      date: '2026-09-13T18:25:57-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '7b0749d20d57b9def238910b1e0b2405cd9e2a25',
      repository: 'omg',
      title: 'block parent manager configuration',
      detail:
        'Secured manager commands run outside the project tree. Cargo configuration is isolated and pip configuration files are disabled to limit inherited source settings.',
      date: '2026-09-13T18:25:00-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '503145cc3e840da3bc8eb3b477c7172dc08afd2b',
      repository: 'omg',
      title: 'isolate tool manager resolution',
      detail:
        'The resolved manager executable is retained for user-managed runtimes, while project-local manager selection is rejected by the secured command builder.',
      date: '2026-09-13T18:24:07-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: 'cbc9f73c906d78374dd99b071c8d8edadcf963c6',
      repository: 'omg',
      title: 'reject alternate tool package sources',
      detail:
        'Manager-specific package-name rules reject local paths, Git shorthands and alternate-source specifications for registry-backed tool installs.',
      date: '2026-09-13T18:22:37-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: 'a5a9ec2bf14c4e11526422ddf786a0a4bbea656c',
      repository: 'omg',
      title: 'constrain Go tool builds',
      detail:
        'Go tool installs disable CGO and automatic toolchain downloads by default. Each capability has its own package-specific exception.',
      date: '2026-09-13T18:21:30-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: 'd356fee5dc45caee579199ca1e195aae519ea2a0',
      repository: 'omg',
      title: 'verify npm packages before scripts',
      detail:
        'npm first installs with lifecycle scripts disabled, then runs signature checks. An explicitly approved script rebuild happens after verification.',
      date: '2026-09-13T18:20:54-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: 'f4a89bd417d1ef1daa1c7c6581c78e997d1afbfd',
      repository: 'omg',
      title: 'surface tool policy overrides',
      detail:
        'Every matching package-specific security override is printed before installation, so exceptions remain visible when installing or updating tools.',
      date: '2026-09-13T18:20:24-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '4c8c1917f4a0b6b613e026bf6952d1de068557e0',
      repository: 'omg',
      title: 'pin tool installer executable path',
      detail:
        'Installer child processes use a restricted executable search path instead of inheriting every directory from the calling shell.',
      date: '2026-09-13T18:19:54-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: 'fe9cee6dc921e48b8b80bf694c0adc94051994c6',
      repository: 'omg',
      title: 'harden managed tool installations',
      detail:
        'Managed npm, Cargo, pip and Go installs use a separate home and configuration. Defaults disable npm lifecycle scripts, require Python wheels and use Cargo lockfiles, with explicit compatibility exceptions.',
      date: '2026-09-13T18:18:34-05:00',
      branch: 'development',
      category: 'Tool installs',
    },
    {
      sha: '03c692da3507aa200931261c486c24261d500342',
      repository: 'omg',
      title: 'Require Reproducible Builds for High-Risk AUR Packages',
      detail:
        'Selected high-risk AUR packages require a second build whose output matches before installation. The policy covers sensitive integration content and privileged package features.',
      date: '2026-09-13T17:55:02-05:00',
      branch: 'development',
      category: 'Packages & runtimes',
    },
    {
      sha: 'ae5b67388daa1095021e27052d2968c311839038',
      repository: 'omg',
      title: 'Harden Package-Manager Privilege Boundaries',
      detail:
        'Package-manager hardening strengthens trusted executable selection, privilege boundaries and AUR artifact handling, alongside runtime verification improvements.',
      date: '2026-09-13T17:33:08-05:00',
      branch: 'development',
      category: 'Packages & runtimes',
    },
  ],
  syncedAt: '2026-09-14T00:11:13.007414+00:00',
  stale: true,
};
