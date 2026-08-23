---
id: p10-012
phase: P10
sequence: 12
slug: revoked-machine-resurrection
status: verified-p11
verdict: VALID
severity: high
title: Revoked machine resurrects itself — validate-license ignores is_active on the existing-machine path
original: p6-002-revoked-machine-resurrection.md
debate: piolium/chamber-workspace/C4-concurrency-state-machine/debate.md
---

## Summary

Machine lifecycle has two states (`machines.is_active`: 1 active / 0 revoked, set by the dashboard revoke endpoints `dashboard.ts:130`, `:191`, `:574`). The seat-limit enforcement path in `registerOrTouchMachine` correctly counts only `is_active = 1` rows (`license.ts:288`), but the *existing-row* path selects machines with **no `is_active` filter** (`SELECT id FROM machines WHERE license_id = ? AND machine_id = ?`) and merely bumps `last_seen_at`. A revoked machine therefore transitions revoked → serving-valid-JWT with zero state check: the terminal state is not terminal, and the transition is not gated anywhere. This defeats the entire purpose of revocation — the dashboard operator's "revoke" action does not stop the CLI from obtaining fresh 7-day offline JWTs.

## Evidence

- Entity schema: `machines.is_active INTEGER DEFAULT 1`, `revoked_at DATETIME` (`0000_current_baseline.sql:494-509`)
- Code path (state write / revocation): `dashboard.ts:191` — `UPDATE machines SET is_active = 0 WHERE license_id = ? AND machine_id = ?`
- Code path (state read that should gate): `license.ts:255` — `SELECT id FROM machines WHERE license_id = ? AND machine_id = ?` (no `AND is_active = 1`)
- Code path (subsequent mint): `validateLicense` proceeds unconditionally after `registerOrTouchMachine` returns null → `generateLicenseJWT` (7-day exp, full tier/features claims)
- Enclosing transaction: n/a — the defect is a missing state predicate, not a missing txn
- Lock primitive: n/a
- Note: `revoked_at` exists in schema but is never written by any handler — revocation bookkeeping is half-implemented

## Attack Steps

1. Customer activates machine M on a pro license; later revokes it in the dashboard (is_active=0).
2. The CLI on machine M calls `POST /api/validate-license` with the same license key + machine_id.
3. Expected: rejection ("machine limit reached"/revoked). Actual: existing-row path finds the revoked row, touches it, returns null (valid); a fresh signed JWT valid 7 days offline is returned. Revocation is only cosmetic — seat count drops (freeing a slot for another machine), so the license holder gets an extra usable seat plus continued access for the revoked device.

## Why This Passed SAST

A missing WHERE predicate is invisible to taint and pattern rules; the check exists on the sibling count query, giving false assurance.

## Recommended Fix

Filter `AND is_active = 1` in the existing-machine lookup and treat an inactive match as a new-registration attempt subject to the seat count (or explicitly reject/reactivate per product policy), and set `revoked_at` in the revoke handlers.

Adversarial-Verdict: CONFIRMED
Adversarial-Rationale: Executed PoC showed a dashboard-revoked machine immediately re-validating with a fresh signed JWT while freeing its seat for a second concurrently-valid machine on a max_machines=1 license.
Severity-Final: high
PoC-Status: executed
Protocol: http
Auth-Required: yes
Auth-Roles-Required: user
