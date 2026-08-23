---
id: p10-009
phase: P10
sequence: 9
slug: get-license-anonymous-email-enumeration
status: valid
verdict: VALID
severity: medium
title: Anonymous email-keyed license lookup discloses account status, tier, and machine counts for any address
original: p5-003-get-license-anonymous-email-enumeration.md
debate: piolium/chamber-workspace/C3-cross-account-enumeration/debate.md
---

## Summary

`GET /api/get-license` requires **no credential of any kind** — the sole input is an arbitrary `email`
query parameter. The handler resolves the customer row by that email and returns tier, license status,
expiry, max seats, active machine count, and a masked license key (`maskKey`, prefix/suffix retained).
The acting identity is never compared to the resource owner because no identity exists on the request.
This is a systematic enumeration oracle: an attacker confirms which emails are registered customers,
their paying tier, subscription health (expired/canceled), fleet size, and harvests masked key
prefix/suffix pairs useful for correlating leaked keys. The route is by-design in the shared registry
(`authentication: 'none'`) — presumably for a support/lookup flow — but the data returned exceeds what a
public lookup needs.

## Evidence

- Handler: `site/workers/src/handlers/license.ts:521` —
  `` SELECT l.license_key, l.tier, l.status, l.expires_at, l.max_seats as max_machines ... WHERE c.email = ? `[email]`
  plus active-machine count at :541 (`WHERE c.email = ? AND m.is_active = 1`).
- Guard stack observed: none at L1/L2/L3 — registry entry `getLicense.authentication = 'none'`
  (`site/shared/licensing-routes.ts`).
- Object-id parameter: `email`.
- Ownership clause: absent — there is no session/bearer/license credential involved anywhere in the path.
- Response includes `license_key: maskKey(license.license_key)` (:555).

## Attack Steps

1. From any network connection, issue `GET https://omg-api.latham.cloud/api/get-license?email=ceo@target.com`.
2. Repeat across a purchased or scraped email list; response deltas separate customers from
   non-customers and paying tiers from free.
3. Aggregate tier/status/machine-count per target to profile organizations before phishing or targeted
   license abuse; collect masked key fragments for leak correlation.

## Why This Passed SAST

The query is fully parameterized and the handler contains no *missing* call a rule would flag — the
absence of an authentication step on an intentionally public route is exactly the "silent missing check"
class structural tools cannot see.

## Recommended Fix

Require a proof-of-ownership factor (license key, session, or signed request) before returning any
license data; if a public check-and-return flow is required, return only `{ found: boolean }` with no
tier/status/count details, and rate-limit per IP.

---

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous

PoC: poc.sh (setup.sh provisions real `wrangler dev` workerd + local D1 migrations + seeded victims).
Executed against the production Worker code path; evidence in evidence/ (exploit.log, impact.log,
healthcheck.log, setup.log, env-info.txt). Unauthenticated GET /api/get-license?email=<victim>
returned found:true with tier/status/expires_at/used_machines/masked key; unregistered email
returned found:false (registration oracle). Final stdout line is the structured JSON verdict.
