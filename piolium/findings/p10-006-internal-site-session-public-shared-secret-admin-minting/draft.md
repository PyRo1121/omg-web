---
id: p10-006
phase: P10
sequence: 6
slug: internal-site-session-public-shared-secret-admin-minting
status: verified-p11
verdict: VALID
severity: high
title: Internal site-session endpoint reachable from the public internet behind a single static secret with transitive role minting (merges p4-005)
original: p5-001-internal-site-session-public-reachability.md
debate: piolium/chamber-workspace/C2-privilege-trust-boundary/debate.md
---

## Summary

`POST /api/internal/site-session` is designed as an intra-cloud service-binding endpoint (the omg-site BFF
calls it to mint Worker sessions from Better Auth identities), but it is registered in the same public
route table as every customer-facing API route and is therefore reachable by anyone on the internet at
`omg-api.latham.cloud`. Its only guard is the `X-Admin-Secret` header compared against the static
`ADMIN_API_SECRET` constant-time compare, fail-closed when unset (`admin-secret.ts:26-31`). A holder of
that single secret — leak, weak value, or a compromised non-admin integration — can mint arbitrary
customer rows and sessions **with `role:'admin'` projection** (`syncCustomerRole` writes
`customers.admin = role === 'admin' ? 1 : 0`, site-session.ts), yielding full `/api/admin/*` access
including PII CSV exports. There is no network-layer enforcement that traffic arrived via service binding,
no IP allowlist, and no rate limit on this route.

## Evidence

- Handler: `site/workers/src/worker.ts` — `case '/api/internal/site-session': return handleCreateSiteSession(request, env);`
- Guard stack observed: L2-only — `requireAdminSecret(request.headers.get('X-Admin-Secret'), env.ADMIN_API_SECRET)`
  (`site/workers/src/admin-secret.ts:26`); no middleware layer exists (exact-switch dispatcher).
- Secret comparison is timing-safe and fail-closed (positive control) — the finding is exposure topology,
  not comparison weakness.
- Privilege write: `site/workers/src/handlers/site-session.ts:syncCustomerRole` —
  `` db.prepare(`UPDATE customers SET admin = ? WHERE id = ?`).bind(admin, customer.id) ``
  driven entirely by attacker-supplied body field `role`.
- Registry classifies transport as `'internal'` (`site/shared/licensing-routes.ts`, internalSiteSession)
  but the dispatcher does not enforce transport — any externally routable request resolves identically.

## Attack Steps

1. Obtain `ADMIN_API_SECRET` once via any leak vector (repo history, logs, misconfigured wrangler secret
   listing, compromised CI) — or note that no other control would stop a brute-force attempt if the
   secret were low-entropy.
2. `curl -X POST https://omg-api.latham.cloud/api/internal/site-session -H 'X-Admin-Secret: [REDACTED:secret]' \
   -d '{"email":"attacker@evil.test","name":"x","betterAuthUserId":"...","role":"admin"}'`
3. Response contains a live 30-day Worker session token for an admin-flagged customer; present it as
   `Authorization: Bearer` to all ~26 `/api/admin/*` routes (PII exports, tier manipulation).

## Why This Passed SAST

The guard exists and is individually correct (constant-time, fail-closed); SAST sees a protected endpoint.
The flaw is the absence of a *second*, environmental control (binding-only reachability), which is a
deployment-topology property invisible to code-level rules.

## Recommended Fix

Enforce internal transport at dispatch (reject when the request did not arrive via the service binding,
e.g. require the shared secret AND a per-request HMAC, or move the route to a dedicated internal-only
worker/binding), and drop `role` elevation from the public route table entirely.

Adversarial-Verdict: CONFIRMED
Adversarial-Rationale: Executed PoC minted an admin-flagged session from a public-form request using only the static secret and used it to obtain HTTP 200 from /api/admin/dashboard, with no transport/rate/IP controls on the path — secret-possession precondition downgrades severity from high.
Severity-Final: medium
PoC-Status: executed

Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
PoC-Note: Requires possession of the single static ADMIN_API_SECRET (passed via $ADMIN_API_SECRET env; set by evidence/setup.sh). Real-env run (workerd + local D1): public-form POST to /api/internal/site-session with X-Admin-Secret minted a session whose customer row has admin=1 (attacker-controlled body role field, syncCustomerRole); token returned HTTP 200 from /api/admin/dashboard, /api/admin/users, and /api/admin/export/users. Control without secret -> 401 fail-closed.
