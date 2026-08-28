# ADR 0002: Better Auth owns organization memberships

**Status:** accepted
**Date:** 2026-08-28

## Context

OMG's Team and Enterprise tiers have seat limits, shared telemetry, fleet data, and routes that currently call machines “team members.” Machines are not authenticated employees. Supporting employee invitations, roles, removal, and organization context requires a real membership domain.

Two designs were considered:

1. Better Auth's exact-pinned organization plugin owns organizations, members, roles, invitations, and active organization session context; `omg-saas` continues to own licensing, seats, usage, billing, and audit.
2. `omg-saas` implements a custom organization and invitation system while Better Auth owns identities and sessions only.

## Decision

Use Better Auth 1.7.1 organizations with the fixed roles Owner, Admin, and Member.

- Better Auth owns organization, membership, invitation, and session-context schemas and lifecycle behavior.
- SvelteKit performs the initial organization, Owner, and active-session inserts in one D1 batch. Better Auth 1.7.1's create endpoint writes those rows separately, so its public organization-creation endpoint stays disabled.
- Wrangler owns the immutable D1 migrations for those tables.
- Better Auth nested teams, dynamic roles, and custom permission builders remain disabled.
- `omg-saas` remains authoritative for active Team/Enterprise entitlement and seat limits.
- A hidden organization-to-customer link is never returned to browser clients.
- A D1 insert trigger is the final atomic seat-limit boundary, closing Better Auth's count-before-insert concurrency window.
- All customer and operator UI remains URL-addressable and server-first through SvelteKit.
- Machines and employees remain separate domain concepts and contracts.

## Consequences

### Positive

- Invitation and membership identity behavior uses the established authentication dependency instead of custom security-critical code.
- Existing Better Auth sessions can carry active organization context.
- Licensing, Stripe reconciliation, telemetry, and D1 migration ownership remain unchanged.
- The role model stays understandable and testable.
- Atomic D1 enforcement prevents concurrent invitation acceptance from exceeding paid seats.

### Costs

- New immutable D1 schema and triggers are required.
- Better Auth hooks must call a private Worker email capability because Svelte does not own the Cloudflare Email binding.
- Better Auth plugin endpoints require explicit authorization, rate-limit, and projection testing.
- Downgrade and ownership-transfer states need product-specific rules beyond the plugin defaults.

## Rejected alternative

A custom Worker organization domain was rejected because it would duplicate invitation lifecycle, verified-email matching, membership authorization, and session organization context without a present requirement that justifies the added security and maintenance surface.

## Implementation reference

See `docs/specs/organization-workspace.md` and `docs/tasks/organization-workspace.md`.
