# Team and Enterprise organization workspace

**Status:** approved
**Date:** 2026-08-28
**Decision:** Better Auth organizations with Owner / Admin / Member roles

## 1. Problem

The current product has paid Team and Enterprise tiers, seat limits, machine telemetry, and `/api/team/*` routes. It does not yet have an employee domain. The retained `handleGetTeamMembers` handler calls machine rows “team members”; machines may carry reported user labels, but they are not authenticated people, memberships, invitations, or authorization principals.

Team and Enterprise customers need a real organization workspace where they can invite employees, manage roles, remove access, understand seat use, and inspect organization activity. Free and Pro customers still need complete individual dashboards with clear upgrade boundaries. Operators need organization support visibility without exposing raw authentication, billing, customer, license, member, invitation, or machine identifiers to browsers.

## 2. Goals

A verified Team or Enterprise owner can:

- create or bootstrap one organization linked to the account's active paid entitlement;
- invite verified employee email addresses;
- see accepted members and pending invitations;
- change Admin and Member roles;
- revoke invitations and remove members;
- transfer ownership through an explicit high-friction workflow;
- inspect exact seat use, fleet summaries, member-attributed usage, and organization audit events.

An organization Admin can invite, revoke, and manage Members but cannot remove or demote the Owner, transfer ownership, change billing, or exceed the paid seat entitlement.

A Member can inspect the organization context allowed by policy but cannot mutate membership or billing.

An OMG operator can inspect organization, membership, invitation, seat, entitlement, and audit state through browser-safe projections and perform explicitly approved audited support operations.

## 3. Non-goals

- Better Auth's optional nested “teams” feature is not enabled. The product's Team tier is an organization entitlement, not a request for sub-teams.
- Custom roles, SCIM, SAML, domain claiming, directory sync, and policy builders are deferred until a concrete Enterprise requirement exists.
- Machines are never treated as employees. Machine fleet state remains a separate capability.
- Free and Pro accounts cannot create organizations or reserve employee seats.
- No browser receives Better Auth member/invitation IDs, D1 keys, Stripe IDs, license IDs or keys, machine IDs, session tokens, or private action tokens.
- No aggregate client-side dashboard or browser-to-`omg-saas` API is introduced.

## 4. Selected design

### Design A — Better Auth organizations plus licensing enforcement — selected

Better Auth 1.7.1 owns organization identity, membership, roles, invitations, active organization session context, and invitation acceptance. `omg-saas` remains authoritative for tier, status, seat entitlement, machines, usage, billing, and audit events.

SvelteKit exposes URL-addressable, server-first organization routes. Named actions bound and decode forms. Membership and invitation lifecycle actions call Better Auth server APIs. Organization bootstrap uses one D1 batch to create the organization, its Owner membership, and active session context atomically because Better Auth 1.7.1 creates those rows in separate statements. The private `LICENSING_API` binding remains the path for licensing, audit, and invitation-email capabilities.

Wrangler remains the only D1 migration authority. Alchemy continues to deploy Svelte resources and does not manage D1 schema.

### Design B — custom Worker organization domain — rejected

A custom domain would keep identities in Better Auth but implement organizations, invitations, memberships, and role authorization in `omg-saas`.

It provides maximum control and simpler coupling to licensing, but duplicates mature authentication-adjacent behavior: invitation lifecycle, verified-email ownership, session organization context, role transitions, and membership authorization. That increases the security-critical surface and long-term maintenance burden without a current product requirement that Better Auth cannot satisfy.

## 5. Ownership and data model

### Better Auth-owned tables

Wrangler adds immutable schema for the exact-pinned Better Auth organization plugin using explicit model and field names:

- `auth_organization`
  - `id`, `name`, `slug`, optional logo/metadata, timestamps;
  - hidden `billing_customer_id`, unique and never returned to browser clients.
- `auth_member`
  - `id`, `organization_id`, `user_id`, role, created timestamp;
  - unique `(organization_id, user_id)`.
- `auth_invitation`
  - `id`, `organization_id`, normalized email, role, status, expiry, inviter, created timestamp.
- `auth_session.active_organization_id`
  - optional active organization context.

Better Auth's nested `team` and dynamic-role tables are not created.

### SaaS-owned data

Existing `customers`, `licenses`, `machines`, usage, billing, and audit tables remain authoritative. The hidden organization billing link maps an organization to one SaaS customer without exposing the SaaS key.

No machine row becomes a membership row. Member-attributed usage is derived only when a verified member email can be matched to bounded machine telemetry; unmatched machines remain “unattributed fleet,” never fabricated employees.

## 6. Roles and permissions

### Owner

- exactly one required owner per organization;
- all Admin capabilities;
- billing portal and plan visibility;
- ownership transfer;
- organization deletion only through a later explicit product decision.

### Admin

- list members and pending invitations;
- invite Members or Admins within seat limits;
- revoke pending invitations;
- change Member/Admin roles;
- remove Members and other Admins;
- cannot mutate Owner or billing authority.

### Member

- read organization summary, allowed usage, fleet, and audit projections;
- no membership, invitation, role, ownership, or billing mutations.

Role checks occur server-side for every load and action. Hiding a control is never authorization.

## 7. Seat and entitlement invariants

- Only an active Team or Enterprise license authorizes an organization.
- Every accepted membership, including the Owner, consumes one seat.
- Pending invitations do not consume a seat. Acceptance is the authoritative seat-allocation point.
- A D1 `BEFORE INSERT` trigger on `auth_member` closes concurrent-acceptance races by rejecting inserts when accepted members already equal `licenses.max_seats` or the linked license is not active Team/Enterprise.
- Application checks provide useful action failures; the trigger is the final integrity boundary.
- Downgrades or payment failures never silently delete members. The organization becomes restricted: reads and removals remain available, while invitations, role expansion, and new member acceptance fail closed.
- Stripe webhooks remain the entitlement authority. Organization actions never directly grant a paid tier.
- The last Owner cannot be removed or demoted. Ownership transfer is one explicit operation that atomically promotes the new Owner and demotes the old Owner or fails without changing either.

## 8. Invitation lifecycle

- Only verified Owner/Admin sessions may invite.
- Inputs are normalized and bounded before identity, database, or email work.
- Invitations use Better Auth's opaque random IDs and expire after 48 hours.
- Email links wrap the Better Auth ID in a stage-secret AES-GCM reference; the accept route moves that reference into an HttpOnly cookie and redirects to a clean URL before any page render.
- Invitation acceptance requires a verified session email matching the normalized invited email.
- Public responses do not reveal whether an unrelated email already has an OMG account.
- Re-inviting cancels the previous pending invitation before issuing a new one.
- Delivery occurs through a private `LICENSING_API` invitation-email capability backed by Cloudflare Email Service; no email API key enters Svelte.
- Email delivery failure leaves an explicit retryable state and does not report successful delivery.
- Invite, resend, revoke, accept, reject, expiry, role change, removal, and ownership transfer emit audit events without invitation IDs or email bodies in logs.

## 9. Routes and projections

### Customer workspace

```text
/dashboard/organization/           entitlement and seat summary
/dashboard/organization/members/   accepted members and pending invitations
/dashboard/organization/usage/     attributed and unattributed usage
/dashboard/organization/audit/     bounded organization audit history
```

The shared account navigation renders Organization only for eligible or restricted organization accounts. Free and Pro users receive useful individual analytics, achievements, machines, settings, and an honest upgrade boundary; they do not receive fake disabled employee controls.

### Operator workspace

```text
/admin/organizations/              searchable organization directory
/admin/organizations/support/      selected browser-safe support workspace
```

Browser-safe organization projections may contain display names, normalized member emails, role labels, invitation status/expiry, seat counts, and grounded usage. They never contain raw database or provider references.

## 10. Boundary and failure behavior

- Every form, Better Auth result, D1 row, private Worker response, and email result is bounded and schema-decoded once.
- Named actions classify anonymous, unverified, ineligible-tier, forbidden-role, seat-full, duplicate-member, duplicate-invitation, expired-invitation, rate-limited, malformed, delivery-failed, and unavailable outcomes.
- Membership and invitation mutations are rate-limited per organization and actor.
- All protected responses are `private, no-store`, `noindex, nofollow`.
- Components remain thin and receive capability-shaped projections with explicit empty, restricted, and unavailable states.

## 11. Security requirements

- Every query and mutation is scoped by the active organization and verified actor membership.
- User-supplied organization, member, invitation, customer, license, or machine IDs are never trusted.
- Cross-tenant references return the same forbidden/not-found class and do not confirm existence.
- Ownership transfer requires recent authentication, exact target email confirmation, and a second explicit confirmation value.
- Removing a member revokes organization authorization immediately; account-wide session revocation is reserved for compromised-account workflows.
- Better Auth organization endpoints retain the same CSP, origin, cookie, rate-limit, and no-store protections as existing auth endpoints.
- Audit metadata is bounded and excludes secrets, tokens, raw IDs, request bodies, and invitation URLs. The browser-facing acceptance reference is never included in page data or DOM.

## 12. Smallest delivery sequence

1. **Schema and entitlement guard:** immutable migration, organization plugin configuration, exact role permissions, D1 seat trigger, migration/authorization tests.
2. **Organization bootstrap:** one eligible owner creates one organization through an atomic D1 batch; ineligible and restricted states are complete. Better Auth's public organization-creation endpoint remains disabled.
3. **Invitation vertical slice:** bounded invite action, private email delivery, verified acceptance, seat-race enforcement, resend/revoke, tests.
4. **Member operations:** roster, role changes, removal, ownership transfer, session authorization tests.
5. **Organization intelligence:** seat utilization, attributed/unattributed usage, fleet health, and organization audit route.
6. **Operator support:** organization directory and audited support operations.
7. **Legacy correction:** replace machine-as-member labels and remove superseded `/api/team/*` runtime paths once CLI and Svelte callers use explicit membership/fleet contracts.

Each slice must be deployable and useful without a temporary public proxy or compatibility API.

## 13. Verification gates

- migration checksum and fresh-schema tests;
- Better Auth exact-version generated-schema comparison;
- role permission matrix and cross-tenant denial tests;
- concurrent final-seat acceptance test proving the D1 trigger;
- invite expiry, email mismatch, resend, revoke, and delivery-failure tests;
- last-owner and ownership-transfer atomicity tests;
- tier downgrade/restriction and Stripe reconciliation tests;
- browser projection tests proving prohibited IDs/tokens are absent;
- Svelte strict checks, focused tests, lint, build, shadow deploy, all-noop follow-up plan;
- user-controlled authenticated desktop and compact-viewport characterization.
