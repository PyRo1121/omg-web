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
- **`allowScripts` fields are inert under plain npm.** Native npm has no lifecycle-script allowlisting; the blocks in each `package.json` record _intent_ (which transitive packages may run postinstall scripts) and are consumed by no current tooling. Do not rely on them as a supply-chain control — treat unexpected new install scripts in `npm ci` output as a review blocker until a package manager with script gating is adopted.

## Project layout

- `site/` — the SvelteKit web application
- `workers/` — Cloudflare Workers
- `tools/` — development tooling

## Security

Report security issues privately per `SECURITY.md`. Do not include secrets,
tokens, or credentials in code, commits, or logs.

## Questions

Open a discussion or issue. Maintainers respond asynchronously.
