---
id: p10-005
phase: P10
sequence: 5
slug: otp-attempt-burnout-login-dos
status: valid
verdict: VALID
severity: medium
title: OTP verify-code failure path burns attempts on the victim's only active code — unauthenticated login lockout for any email
original: p8-003-otp-attempt-burnout-login-dos.md
debate: piolium/chamber-workspace/C1-auth-otp-abuse/debate.md
---

## Summary

The OTP brute-force protection is per-code (`attempt_count < 5` inside the atomic claim,
`auth.ts:337-349`) — sound against guessing a *specific* code. But the **failure path**
increments `attempt_count` on the victim's single active code regardless of what the
attacker submits:

```sql
UPDATE auth_codes
SET attempt_count = attempt_count + 1,
    used = CASE WHEN attempt_count + 1 >= 5 THEN 1 ELSE used END
WHERE id = (
  SELECT id FROM auth_codes WHERE email = ? AND used = 0 AND expires_at > datetime('now')
  ORDER BY created_at DESC LIMIT 1
) AND used = 0
```

(`auth.ts:363-374`). Combined with the single-active-code policy — `send-code` marks all
prior codes `used=1` on each send (`auth.ts:254-256`) and verify success invalidates the
rest (`auth.ts:382-386`) — an attacker who knows only the victim's email can:

1. trigger a code send (or wait for the victim to sign in),
2. submit 5 arbitrary wrong codes for that email,
3. force `used = 1` on the code sitting in the victim's inbox.

The victim's legitimate login then fails with "Invalid or expired code" until they request
and use a fresh code within one 10-minute window. There is **no IP rate limiter** on this
route (`AUTH_RATE_LIMITER` is declared in `wrangler.toml:26-29` but has zero call sites —
p5-002/p7-003) and **Turnstile is skipped** when its secret is unset (p4-001, default-off),
so the burnout loop can run at line speed indefinitely: every new legitimate code the
victim requests can be burned within seconds of arrival. This converts a protective control
(attempt capping) into a targeted sign-in denial-of-service primitive requiring nothing but
the victim's email address.

Note the failure-path UPDATE cannot check the submitted digest by design (wrong codes don't
match); the defect is not the counter itself but the absence of any IP-scoped throttle or
bot gate around it while it guards the *only* active code for the email.

## Evidence

- Atomic claim with `attempt_count < ?`: `site/workers/src/handlers/auth.ts:337-349`
  (`MAX_OTP_ATTEMPTS = 5`, `auth.ts:120`).
- Failure-path increment + auto-invalidate at threshold: `auth.ts:362-374`.
- Single-active-code enforcement: `auth.ts:254-256` (send replaces), `auth.ts:382-386`
  (verify invalidates rest).
- No limiter: grep across `site/workers/src` shows no reference to `AUTH_RATE_LIMITER`;
  declared-only at `wrangler.toml:26-29`.
- Turnstile fail-open: `auth.ts:186-188`.
- Uniform 401 responses mean the attacker gets no feedback distinguishing burnout from
  wrong code — irrelevant; they simply keep burning after each victim resend.
- Expiry canonicalization gap (p7-001) further widens the window in which a burned code
  stays the active target.

## Attack Steps

1. `POST /api/auth/send-code {"email":"victim@example.com"}` (attacker-triggered or natural).
2. Immediately loop
   `POST /api/auth/verify-code {"email":"victim@example.com","code":"000000".."000004"}`
   — five requests mark the active code `used = 1`.
3. Victim enters the real code → 401. Repeat from step 1 each cycle; the victim can never
   complete sign-in while the attack runs. No captcha, no IP limit intervenes in the
   shipped configuration.

## Why This Passed SAST

The claim statement is a textbook-correct atomic conditional update; scanners reward it.
The vulnerability emerges from composition (per-email single-active-code + unprotected
failure path) and from deployment-level absences (limiter binding never wired, Turnstile
unset) — invisible to per-file analysis.

## Recommended Fix

Rate-limit `verify-code` per IP (wire the already-declared `AUTH_RATE_LIMITER`) and enable
Turnstile on verify (not just send). Consider scoping attempt counts to (email, code-digest)
prefix rather than latest-active-code so junk submissions cannot consume a legitimate
code's attempts, or allow multiple concurrent valid codes with per-code counters.

---

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
PoC-Artifacts: poc.test.ts (vitest cloudflare-pool test), poc.sh (runner)
PoC-Result: Control proves normal login works (real code -> 200 + session token). Exploit: after one send-code, attacker submits only 5 arbitrary wrong codes for the victim's email -> D1 ground truth shows the victim's single active code burned (attempt_count=5, used=1); the victim's legitimate inbox code then returns 401 "Invalid or expired code". Two further replacement codes were each burned the same way within seconds of issue (cycle1: 401, cycle2: 401) — sustained sign-in lockout. 15 total attacker verify-code requests produced zero IP throttling (AUTH_RATE_LIMITER unwired; TURNSTILE_SECRET_KEY unset => fail-open), so the loop can run at line speed. Executed via real worker.fetch in workerd with local D1 production migrations (incl. 012_secure_otp); EMAIL binding stubbed 1:1 with delivery.
