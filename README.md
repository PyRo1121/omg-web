# omg-web

Website, documentation site, and web workers for OMG.

## Structure

- `site/` - production Solid application retained only through the Svelte cutover observation gate
- `site-svelte/` - SvelteKit public, account, and operator application
- `shared/` - cross-runtime contracts
- `workers/api/` - independently deployed licensing, billing, telemetry, and administration API

## Related Repository

Core Rust CLI and daemon live in:

- `https://github.com/PyRo1121/omg`
