# Contributing to OMG Web

Thanks for your interest in contributing to OMG Web.

## Code of conduct

Be respectful and constructive. Harassment and discrimination are not tolerated.

## How to contribute

1. **Open an issue** first for bugs, feature requests, or design discussions.
2. **Branch from `main`** using a short, descriptive name
   (`feat/<area>-<summary>` or `fix/<area>-<summary>`).
3. **Keep changes small and focused.** One logical change per pull request.
4. **Add tests** for behavior you change (Vitest).
5. **Run the checks** before opening a PR:
   - `npm run lint` (oxlint)
   - `npm run typecheck` (tsc)
   - `npm test` (Vitest)
6. **Open a pull request** against `main`. It must pass CI before merge.

## Toolchain notes

- **npm version:** the repo pins `packageManager: "npm@12.0.2"` in every manifest. Local runs should use that version (`corepack enable npm`); CI enables it explicitly.
- **Lifecycle scripts:** npm 12 implements `allowScripts`; keep the reviewed, version-qualified entries in each manifest. Unexpected install scripts are a review blocker. Do not disable this gate to install a dependency. Diagnose user-level configuration conflicts without printing credentials or rewriting another user's npm configuration.

## Project layout

- `site/` — the SvelteKit web application
- `workers/api/` — independent licensing and telemetry Worker
- `shared/` — shared contracts and policy
- `tools/` — development tooling

Run the root `npm run check` before proposing a release. A successful build does not authorize deployment, migrations, hostname changes, or session cleanup. See [production operations](docs/operations/svelte-production-cutover.md).

## Security

Report security issues privately per `SECURITY.md`. Do not include secrets,
tokens, or credentials in code, commits, or logs.

## Questions

Open a discussion or issue. Maintainers respond asynchronously.
