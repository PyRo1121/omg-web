# Worker tests

These tests run the `omg-saas` Worker in Cloudflare's Vitest isolate with an in-memory D1 database. The test environment applies the immutable migrations from `../migrations/`; it does not maintain a separate schema or setup SQL file.

## Commands

Run these from `workers/api/`:

```bash
npm test
npm run test:watch
npm run typecheck:tests
npm test -- telemetry.test.ts
```

The root `npm run check` command runs the Worker tests and their strict TypeScript compiler gate.

## Scope

The suite covers the public licensing and telemetry API, private Svelte service-binding routes, operator routes, billing provider boundaries, privacy operations, route dispatch, migration integrity, and D1 concurrency guards.

Tests should use the real Worker entry point when checking routing, authentication, rate limits, or response headers. A handler or contract may be called directly when the test targets a provider boundary or pure decoder that the Worker isolate cannot observe separately.

## Database state

`vitest.config.ts` loads every migration through `readD1Migrations`. Suites create only the rows they need and remove persistent fixture rows in their own lifecycle hooks. `migration-schema.test.ts` checks the migration sequence and security-critical constraints against the same migrated database.

Do not add a second test schema, mutable migration fixture, or runtime database initializer. Add schema changes as a new immutable migration under `../migrations/` and update `../migrations.sha256` with the guarded migration tool.
