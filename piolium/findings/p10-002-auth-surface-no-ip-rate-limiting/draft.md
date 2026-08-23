---
id: p10-002
phase: P10
sequence: 2
slug: auth-surface-no-ip-rate-limiting
status: verified-p11
verdict: VALID
severity: high
title: Authentication and admin surface has no functioning IP rate limiter — declared bindings never invoked (absorbs p7-003)
original: p5-002-auth-surface-no-ip-rate-limiting.md
debate: piolium/chamber-workspace/C1-auth-otp-abuse/debate.md
---

## Summary

The wrangler.toml comment block promises "10 req/min/IP brute-force protection" via `AUTH_RATE_LIMITER`
and `ADMIN_RATE_LIMITER` bindings, but **no handler code references either binding** — they are dead
configuration. The only throttle on OTP issuance is a per-email D1 count (`auth_codes`, 3 per 10 minutes),
which an attacker trivially rotates across unlimited victim emails. Consequences: unthrottled email
bombing through the platform's own mail relay (EMAIL binding, reputation asset #5 in the KB threat
model), cross-email user enumeration via response deltas, and an unthrottled `/api/auth/verify-session`
token-validity oracle. All other limiter call sites (`API_RATE_LIMITER` in telemetry.ts:98,
site-analytics.ts:257, docs-analytics.ts:44) fail open when the binding is unset.

## Evidence

- Declared but unreferenced: `grep -r AUTH_RATE_LIMITER site/workers/src` → 0 hits; bindings exist in
  `site/workers/wrangler.toml` + `Env`.
- Only throttle on OTP send: per-email count in `handlers/auth.ts` (sendVerificationCode) — keyed by the
  attacker-chosen `email` field, not by `CF-Connecting-IP`.
- Turnstile is skipped entirely when `TURNSTILE_SECRET_KEY` is unset (`handlers/auth.ts:180`
  requireTurnstile), compounding p4-001.
- Guard stack observed for `send-code`: L2-only, partial (per-email D1 count); no Layer-1/3 guard exists
  anywhere in the dispatcher.

## Attack Steps

1. From one IP without any CAPTCHA (default config), loop
   `POST /api/auth/send-code {"email":"victim-N@anywhere.test"}`.
2. Per-email counter never triggers because each request uses a fresh address; thousands of OTP emails
   are relayed from the platform's domain.
3. Same single IP can then run unbounded `/api/auth/verify-code` guesses against *targeted* codes within
   each code's 5-attempt budget, and hammer `/api/auth/verify-session` as a token oracle.

## Why This Passed SAST

A missing control that exists only as configuration prose is silent to every structural rule; SAST cannot
diff wrangler.toml comments against handler call graphs.

## Recommended Fix

Wire `AUTH_RATE_LIMITER.limit({ key: ip })` into send-code/verify-code/verify-session (fail-closed when
the binding is absent), or delete the bindings and correct the documentation if intentional.

Adversarial-Verdict: CONFIRMED
Adversarial-Rationale: Executed reproduction delivered 12 OTP emails from one IP with zero throttling under default config while the promised AUTH_RATE_LIMITER binding has zero call sites in the codebase.
Severity-Final: high
PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
