# Dependency pins and removal conditions

All dependency versions and overrides are exact. Renovate must not automerge changes to this file, an `overrides` block, or `allowScripts`.

## Root `package.json`

- `effect` `3.22.1` owns schema and runtime imports used by top-level `shared/` contracts. Remove it only after every retained shared module stops importing Effect.
- `oxlint` and the checked-in anti-slop plugin enforce the repository TypeScript policy across shared, website, Worker, test, and tool sources.

## `site/package.json`

- `effect` `4.0.0-rc.112` is the application boundary and expected-failure runtime. Changes require strict Svelte diagnostics, TypeScript checks, focused boundary tests, browser verification, and a successful shadow deployment.
- `@sveltejs/kit` under `better-auth` is a package-scoped peer override for the exact-tested SvelteKit 3 prerelease. Remove it when Better Auth declares compatibility with the installed SvelteKit release.
- `@hono/node-server`, `hono`, `lodash`, and `valibot` are security floors for Alchemy's non-optional Prisma development dependency chain. Remove them when Alchemy makes that chain optional or resolves audited versions itself.

## `workers/api/package.json`

Worker dependency changes require the exact generated binding declarations, strict source and test typechecks, the Worker integration suite, a Wrangler dry run, and a clean audit.

## Audit availability

`npm audit` is the primary vulnerability gate. Only exhausted registry or network failures switch the gate to OSV, which checks every exact npm package version in all three lockfiles. Vulnerability results, malformed lockfiles, incomplete responses, and unavailable OSV requests fail immediately.

## Install-script trust

Every package with an allowed lifecycle script is version-qualified in each workspace's `allowScripts` block. Version upgrades must update both the lockfile and the corresponding trust entry in the same reviewed change.

`tools/check-lockfile-integrity.mjs` rejects registry packages without a locked tarball URL and integrity digest. Dependencies bundled inside an integrity-pinned parent tarball are the only exception.
