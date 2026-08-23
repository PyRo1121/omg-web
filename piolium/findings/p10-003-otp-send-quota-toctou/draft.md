---
id: p10-003
phase: P10
sequence: 3
slug: otp-send-quota-toctou
status: valid
verdict: VALID
severity: medium
title: OTP send-code rate limit is check-then-insert — 3-per-10-minutes cap bypassable under concurrency
original: p6-003-otp-send-quota-toctou.md
debate: piolium/chamber-workspace/C1-auth-otp-abuse/debate.md
---

## Summary

The only functioning brake on OTP email sending is a D1 `COUNT(*)` of recent rows compared against 3, followed later by an INSERT (`auth.ts:246` → `auth.ts:258-264`). The check and the write are separate round-trips with no transaction, no conditional insert, and no atomic counter — N concurrent `POST /api/auth/send-code` requests for one email all observe `count < 3` inside the window and all insert. The attacker model is the anonymous internet (Turnstile is fail-open per p4-001; `AUTH_RATE_LIMITER` binding is never called by any handler), so this is the amplification primitive for mailbox-bombing a victim with dozens of OTP emails from a single burst.

## Evidence

- Entity schema: `auth_codes(id, email, code, expires_at, used, attempt_count)` — no unique-per-window constraint (`0000_current_baseline.sql:140-149`)
- Code path (read): `auth.ts:232-244` — `SELECT COUNT(*) as count FROM auth_codes WHERE email = ? AND created_at > datetime('now','-10 minutes')`
- Code path (write): `auth.ts:258-264` — `db.batch([UPDATE auth_codes SET used=1 ...; INSERT INTO auth_codes ...])`
- Enclosing transaction: no — count is outside the batch; batch contains no quota predicate
- Lock primitive: absent (no rate limiter call on this path)

## Attack Steps

1. Attacker picks victim email, fires ~50 concurrent send-code requests.
2. All reads execute before any insert commits (Workers isolate concurrency + network latency guarantees a wide window).
3. Expected: ≤3 emails per 10 minutes. Actual: ~50 OTP emails delivered to the victim in seconds; repeat bursts every 10 minutes for sustained harassment / inbox flooding. Also inflates D1 writes on a shared database.

## Why This Passed SAST

Quota enforcement split across a read and a later write is invisible to syntactic rules; each statement is individually parameterized and "correct".

## Recommended Fix

Make admission atomic: `INSERT INTO auth_codes (...) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM auth_codes WHERE email=? AND created_at > datetime('now','-10 minutes')) < 3` and gate the mailer on `meta.changes === 1`; additionally wire the declared-but-unused `AUTH_RATE_LIMITER` binding as an IP-level pre-check.

---

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
PoC-Artifacts: poc.test.ts (vitest cloudflare-pool test), poc.sh (runner)
PoC-Result: 50 concurrent POST /api/auth/send-code requests for one email → all 50 returned HTTP 200 and inserted auth_codes rows (50 rows within the 10-minute window vs. documented cap of 3). Sequential control: statuses 200,200,200,429,429 (cap intact when serialized), isolating the race as the bypass cause. Executed via real worker.fetch in workerd with local D1 production migrations; EMAIL binding stubbed 1:1 with delivery, TURNSTILE_SECRET_KEY unset (default posture).
