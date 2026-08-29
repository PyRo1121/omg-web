# Team and Enterprise organization workspace tickets

**Spec:** `docs/specs/organization-workspace.md`
**ADR:** `docs/adr/0002-better-auth-organization-memberships.md`

## 1. Schema and authorization foundation

- [x] Configure the exact-pinned Better Auth organization plugin with explicit snake-case models and fields.
- [x] Keep nested teams, dynamic roles, public organization creation, deletion, and direct browser plugin mutation endpoints disabled; server actions own invitation mutations.
- [x] Add an immutable Wrangler migration for organization, member, invitation, and active-organization session state.
- [x] Add unique membership and billing-link constraints.
- [x] Add the atomic D1 active-Team/Enterprise seat-limit trigger.
- [x] Add last-owner integrity protection and a separate ownership-transfer operation.
- [x] Update migration checksums and fresh-schema tests; no competing root schema mirror exists.
- [ ] Add role, tier, seat-race, malformed-row, and cross-tenant tests.

**Blocked by:** none.

## 2. Organization bootstrap

- [x] Add `/dashboard/organization/` with eligible, individual, restricted, unavailable, verification-required, and active states.
- [x] Allow one verified Team/Enterprise owner to bootstrap one organization through one atomic D1 batch.
- [x] Link the organization to the server-side billing customer without returning that key.
- [x] Add the Organization entry point only to eligible Team/Enterprise account overviews.
- [x] Preserve complete Free and Pro individual workspaces and render an honest upgrade boundary on direct access.
- [ ] Complete authenticated desktop and compact-viewport characterization; action, render, and projection tests pass.

**Blocked by:** 1.

## 3. Invitations

- [x] Add a bounded Owner/Admin invite action with Member/Admin role selection.
- [x] Require a verified actor and Better Auth email ownership at acceptance/rejection.
- [x] Add private `LICENSING_API` invitation-email delivery through Cloudflare Email Service.
- [x] Implement 48-hour expiry, re-invite cancellation, resend, revoke, accept, and reject flows.
- [x] Map duplicate, mismatch, full-seat, ineligible-tier, forbidden, expired, rate-limited, delivery, and unavailable failures.
- [x] Record bounded audit events without IDs, bodies, invitation URLs, or tokens.
- [x] Add email-enumeration denial coverage for missing, foreign-recipient, and Better Auth mismatch paths.
- [ ] Add Better Auth integration coverage for concurrent final-seat acceptance; the D1 final-seat race test passes.

**Blocked by:** 2.

## 4. Member operations

- [x] Add read-only `/dashboard/organization/members/` with bounded accepted-member and pending-invitation projections.
- [x] Add Admin/Member role changes with the fixed permission matrix.
- [x] Add member removal and immediate organization authorization revocation.
- [x] Add recent-auth, exact-target, double-confirmed ownership transfer.
- [x] Prevent Owner removal/demotion and self-lockout at the server action boundary.
- [x] Keep Better Auth member/invitation IDs and all SaaS identifiers out of page data and DOM.
- [ ] Add mutation, stale-state, forbidden-role, and cross-tenant tests.

**Blocked by:** 3.

## 5. Organization intelligence

- [x] Add `/dashboard/organization/usage/` with exact seat utilization and member-attributed usage.
- [x] Keep unattributed machines separate rather than inventing employee assignments.
- [x] Add seven-day fleet recency and reported-version distribution using grounded machine telemetry.
- [x] Add `/dashboard/organization/audit/` with bounded filtering and pagination.
- [x] Preserve restricted read/removal behavior after downgrade or payment failure.
- [ ] Add pure derivation, boundary, export, and degraded-state tests.

**Blocked by:** 4.

## 6. Operator organization support

- [ ] Add `/admin/organizations/` directory and browser-safe selected support workspace.
- [ ] Expose entitlement, seat, membership, invitation, usage, fleet, and audit state without raw identifiers.
- [ ] Add only explicitly approved audited support mutations.
- [ ] Add search, pagination, authorization, render, and compact-viewport tests.

**Blocked by:** 4. May proceed in parallel with 5.

## 7. Legacy correction and release gate

- [ ] Rename machine-as-member UI and contracts to fleet/machine vocabulary.
- [ ] Inventory CLI and Solid callers of `/api/team/*`.
- [ ] Replace superseded runtime paths without a compatibility proxy.
- [ ] Run strict checks, focused/full tests, lint, build, audit evidence, migration checks, and source policy.
- [ ] Deploy shadow and require an all-noop Alchemy follow-up plan.
- [ ] Complete user-controlled authenticated desktop and compact characterization for Owner, Admin, Member, restricted, Free, and Pro states.
- [ ] Record rollback, production migration, cutover, and observation evidence.

**Blocked by:** 5 and 6.
