# OTP Attempt Burnout — Unauthenticated Login Denial-of-Service for Any Email

**Vulnerability class:** Authentication bypass of brute-force protection / targeted account lockout (DoS)
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts) / CWE-645 (Overly Restrictive Account Lockout)
**Severity:** Medium
**Affected surface:** `POST /api/auth/verify-code` in the Cloudflare Worker API (`site/workers`)

## Summary

The one-time-code (OTP) login flow on `/api/auth/verify-code` enforces a per-code attempt cap (`attempt_count < 5`) that is sound against guessing a *specific* code, but its **failure path increments the attempt counter on the victim's single active code regardless of what the attacker submits**. Because `send-code` invalidates all prior codes on every send and verify success invalidates the rest, exactly one active code exists per email at any time. An attacker who knows only a victim's email address can therefore burn any freshly issued code by submitting 5 arbitrary junk codes, causing the victim's legitimate inbox code to be rejected with 401 "Invalid or expired code". The shipped configuration has no IP rate limiter wired on this route and Cloudflare Turnstile fails open when its secret is unset, so the burnout loop can run at line speed indefinitely — converting the protective attempt cap into a sustained, targeted sign-in denial-of-service primitive. The PoC was executed against the real worker in workerd with production D1 migrations and confirmed two full burnout cycles plus zero IP throttling across 15 attacker requests.

## Details

Login is email + 6-digit OTP. `POST /api/auth/send-code` generates a code, stores only a digest, mails the plaintext to the user, and — critically for this bug — marks all previous active codes as used before inserting the new one:

```ts
env.DB.batch([
  env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0`).bind(
    body.email
  ),
  env.DB.prepare(
    `INSERT INTO auth_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), body.email, digest, expiresAt),
]),
```

([auth.ts:254-256](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L254-L256)) — the single-active-code policy means there is always exactly one live target per email during a code's 10-minute validity window.

On `POST /api/auth/verify-code`, correct submission is handled by an atomic conditional claim guarded by the attempt cap ([auth.ts:337-349](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L337-L349), with [`MAX_OTP_ATTEMPTS = 5`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L116)); successful verification also invalidates all remaining codes ([auth.ts:382-384](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L382-L384)). When the submitted code does not match anything, execution falls into the failure path:

```ts
env.DB.prepare(
  `UPDATE auth_codes
   SET attempt_count = attempt_count + 1,
       used = CASE WHEN attempt_count + 1 >= ? THEN 1 ELSE used END
   WHERE id = (
     SELECT id FROM auth_codes
     WHERE email = ? AND used = 0 AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 1
   ) AND used = 0`
)
  .bind(MAX_OTP_ATTEMPTS, body.email)
  .run(),
```

([auth.ts:362-374](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L362-L374))

This UPDATE cannot check the submitted digest by design (wrong codes never match), so **every wrong submission charges the miss to the victim's only active code**, auto-invalidating it at the fifth miss. Two deployment-level absences remove any friction around this loop:

- **No IP rate limiting.** A rate-limit binding named `AUTH_RATE_LIMITER` is declared in [wrangler.toml:26-29](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/wrangler.toml#L26-L29) but has zero call sites anywhere in `site/workers/src` — it is never enforced.
- **Turnstile fails open.** In `requireTurnstile`, an unset secret short-circuits to success:

```ts
if (env.TURNSTILE_SECRET_KEY === undefined || env.TURNSTILE_SECRET_KEY.length === 0) {
  return Effect.void;
}
```

([auth.ts:186-188](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L186-L188))

The uniform 401 response gives the attacker no feedback distinguishing burnout from an ordinary wrong code, but that is irrelevant to the attack: they simply re-run the 5-junk-submission cycle each time the victim requests a fresh code.

## Root Cause

The defect is not the atomic attempt counter itself but its **composition with the single-active-code policy under an unprotected endpoint**: the failure-path UPDATE attributes arbitrary attacker misses to the latest active code for the email, and no IP-scoped throttle or bot gate (Turnstile) exists around `verify-code` in the default configuration. The result is that a control intended to cap guessing of a specific code becomes a remote lockout trigger requiring nothing but knowledge of the victim's email address.

## Proof of Concept (PoC)

The runnable exploit is [`poc.test.ts`](piolium/findings/p10-005-otp-attempt-burnout-login-dos/poc.test.ts) (executed via runner [`poc.sh`](piolium/findings/p10-005-otp-attempt-burnout-login-dos/poc.sh)), which drives the real worker's `fetch` handler in workerd against local D1 seeded with the production migrations (including `012_secure_otp`). Configuration mirrors default production posture: `TURNSTILE_SECRET_KEY` unset (fail-open) and `AUTH_RATE_LIMITER` unwired; the email binding is stubbed 1:1 so plaintext codes are captured "as delivered to the inbox".

Attack steps:

1. `POST /api/auth/send-code {"email":"victim@burnout.test"}` — triggers issuance of a fresh code (the victim can also do this themselves).
2. Attacker loops `POST /api/auth/verify-code {"email":"victim@burnout.test","code":"<junk>"}` five times.
3. Victim enters the real code from their inbox → rejected.

Observed output (from `evidence/exploit.log` / `evidence/impact.log`):

```
p10-005 control: victim login with real code -> 200 (token minted: true)
p10-005 attacker wrong-code statuses: 401,401,401,401,401
p10-005 burned codes for victim: 1 at attempt_count=5 (threshold 5)
p10-005 victim login with fresh inbox code -> 401 "Invalid or expired code"
p10-005 replacement-code logins: cycle1: HTTP 401, cycle2: HTTP 401
p10-005 attacker verify-code requests fired: 10, IP throttled (429): 0
```

The control proves normal login works (real code → 200 with session token). After only 5 arbitrary wrong submissions from the attacker, D1 ground truth shows the victim's sole active code burned at `attempt_count=5`, `used=1`, and the legitimate inbox code is rejected. Two subsequent replacement codes were each burned within seconds of issue (cycle1 and cycle2 both HTTP 401), demonstrating sustained lockout, with zero 429 responses across all attacker requests.

## Impact

- **Who is exposed:** any user of email-OTP sign-in whose email address is known to the attacker — email addresses are typically guessable or public, and no authentication is required to call either endpoint.
- **What the attacker gains:** a persistent, targeted sign-in denial-of-service. Every new code the victim requests can be burned within seconds of arrival, so the victim cannot complete sign-in while the attack runs. Codes are valid 10 minutes, but the attacker does not need to win a race — burning takes 5 fast unauthenticated requests.
- **Most at risk:** administrators or high-value accounts on deployments using the default configuration (Turnstile secret unset, limiter binding unwired), where nothing slows the loop.
- **Measured severity:** Medium. There is no data breach, account takeover, or permanent lockout — the victim recovers by requesting and using a fresh code once the attack stops — but availability of authentication for a chosen identity is fully controlled by an anonymous attacker for the duration of the abuse.

## Remediation

1. **Wire the IP-scoped rate limiter on `verify-code`** (and ideally `send-code`): the `AUTH_RATE_LIMITER` binding already declared in `wrangler.toml` has no call sites — enforce it, e.g. a small per-IP budget (a handful of requests per minute).
2. **Enable Turnstile on `verify-code`**, not just send, and make missing-secret behavior configurable rather than silently fail-open in production.
3. **Scope attempt accounting so junk submissions cannot consume the legitimate code's attempts**: track failures keyed by (email, submitted-digest) rather than incrementing the latest active code's counter, or allow multiple concurrent valid codes each with an independent per-code counter.
4. Optionally add progressive backoff or a short cooldown per email after consecutive failed verifications, so repeated burnout cycles become impractical even from rotating IPs.

Confirm-Timestamp: 2026-08-23T09:08:53Z
Confirm-Evidence: piolium/findings/p10-005-otp-attempt-burnout-login-dos/evidence/confirmed-20260823T090853Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:12:26Z
Confirm-Evidence: piolium/findings/p10-005-otp-attempt-burnout-login-dos/evidence/confirmed-20260823T091157Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: victim's legitimate OTP from inbox rejected with 401 'Invalid or expired code' after attacker submitted only 5 arbitrary wrong codes for the email; both replacement codes burned identically across cycles; 15 attacker verify-code requests with zero IP throttling
