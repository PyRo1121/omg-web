# Dependency pins and removal conditions

All dependency versions and overrides are exact. Renovate must not automerge changes to this file, an `overrides` block, or `allowScripts`.

## Root `package.json`

- `effect` `3.22.1` owns the schema/runtime imports used by the top-level `shared/` contracts. Keeping this dependency at the repository root lets Solid, Svelte, and `omg-saas` compile one canonical contract source without tying it to any application directory. Remove it only after every retained shared module stops importing Effect.

## `site/package.json`

- `dax-sh -> npm:dax@0.44.2`: compatibility alias for Vinxi's `dax-sh` request. Remove when the retained Vinxi toolchain no longer requests `dax-sh`; verify `npm ci`, the production build, and deployment dry-run first.
- `follow-redirects`, `h3`, `minimatch`, `nitropack`, `node-forge`, `picomatch`, `serialize-javascript`, and `tar`: transitive security floors retained for the SolidStart/Vinxi production tree. Remove an override only when the parent dependency resolves to an equal or newer audited version without it and `npm audit --prefix site` remains clean.

## `site-svelte/package.json`

- `@sveltejs/kit` under `better-auth`: package-scoped peer override for the exact-tested SvelteKit 3 prerelease. Remove when Better Auth declares compatibility with the installed SvelteKit release.
- `@hono/node-server`, `hono`, `lodash`, and `valibot`: security floors for Alchemy's non-optional Prisma development dependency chain. Remove when Alchemy makes that chain optional or resolves audited versions itself.

## Install-script trust

Every package with an allowed lifecycle script is version-qualified in each workspace's `allowScripts` block. Version upgrades must update both the lockfile and the corresponding trust entry in the same reviewed change. `tools/check-lockfile-integrity.mjs` separately rejects registry packages without a locked tarball URL and integrity digest; dependencies bundled inside an integrity-pinned parent tarball are the only exception.
