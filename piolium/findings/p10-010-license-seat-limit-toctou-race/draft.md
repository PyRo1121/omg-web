---
id: p10-010
phase: P10
sequence: 10
slug: license-seat-limit-toctou-race
status: valid
verdict: VALID
severity: medium
title: Machine seat-limit enforced with non-transactional count-then-insert (TOCTOU)
original: p4-004-license-seat-limit-toctou.md
debate: piolium/chamber-workspace/C4-concurrency-state-machine/debate.md
---

## Summary

`registerOrTouchMachine()` enforces `max_machines` by:

1. `SELECT COUNT(*) FROM machines WHERE license_id = ? AND is_active = 1`
2. comparing against `maxMachinesFor(license)`
3. `INSERT INTO machines (...) VALUES (...)`

The read and write are separate round-trips with no transaction, unique constraint on
`(license_id, machine_id)` covering new ids, or conditional insert. N concurrent
activation requests with distinct `machine_id`s all observe `count < maxMachines` and
all insert, exceeding the paid seat limit. Workers isolates handle requests
concurrently, so this races in production, not only across colos.

## Impact

Seat-limit bypass: a single pro/team license can register arbitrary additional
machines via parallel activation calls, each receiving a signed offline-valid JWT
(7-day expiry). Direct revenue loss; also inflates machine lists shown in admin CRM.

Contrast: the OTP claim path correctly uses an atomic single-statement
`UPDATE ... RETURNING` — the pattern exists elsewhere in the codebase and was not
applied here.

## Recommended direction

Enforce atomically, e.g. `INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < ?` with
a post-check on changes() count, or wrap in `env.DB.batch` inside a transaction, or add
a UNIQUE index plus slot tokens.

## Classification

Likely security/business-logic (monetary integrity). Same-user-class actor (license
holder) but crosses a monetization boundary.

---

## PoC Metadata (Phase 13)

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
