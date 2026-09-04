# ADR 0001: Server-first protected workspaces

**Status:** accepted
**Date:** 2026-08-28

## Context

The replaced account and admin workspaces were client-heavy single-page surfaces with browser API clients, query caches, stores, and broad infrastructure-shaped payloads. The SvelteKit application required full functional parity while preserving strict boundary parsing, free-tier efficiency, private Service Binding access, and the prohibition on browser-visible secrets and internal identifiers.

Three designs were considered:

1. URL-addressable Svelte capability routes with server loads and named actions.
2. One aggregate server load with client-side tabs.
3. Recreation of the previous browser BFF and client query architecture.

## Decision

Protected Svelte workspaces use URL-addressable, server-first capability routes.

- Server loads fetch only the selected capability's data.
- Named actions own mutations and trusted external redirects.
- Route boundaries bound and decode browser inputs once; internal domain logic trusts typed inputs.
- Capability services decode private Worker responses and project browser-safe domain values.
- Browser polling endpoints exist only for genuinely live behavior and remain same-origin, authenticated, bounded, and failure-limited.
- Full parity means every real workflow and grounded metric, not reproduction of unsafe fields, dead controls, or invented values.
- Raw license keys, auth/session tokens, Stripe/customer/database identifiers, and machine identifiers remain absent from Svelte page data and DOM.

## Consequences

### Positive

- Private data and free-tier reads are limited to the active capability.
- Failures remain local instead of degrading the whole workspace.
- URLs preserve navigation and support route-level authorization and verification.
- Svelte components remain thin and transport details stay server-side.
- The previous browser BFF and query/store compatibility layers are absent.

### Costs

- More protected routes and navigation transitions are required.
- Full functional parity remains a substantial migration even though unsafe legacy representation is excluded.
- Live firehose/realtime behavior needs one narrowly scoped polling boundary.

## Rejected alternatives

- **Aggregate server load:** rejected because it amplifies reads, payload size, coupling, and disclosure risk.
- **Recreated browser BFF/query layer:** rejected because it creates a temporary architecture with no permanent owner.
- **Literal sensitive-field parity:** rejected because it violates the approved security invariant.

The accepted design is implemented under `site/src/routes/dashboard/`, `site/src/routes/admin/`, and `site/src/lib/server/`.
