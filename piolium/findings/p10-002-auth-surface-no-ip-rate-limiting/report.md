# Authentication Surface Has No Functioning IP Rate Limiter — Declared `AUTH_RATE_LIMITER` / `ADMIN_RATE_LIMITER` Bindings Are Never Invoked

- **Finding ID:** p10-002 (`auth-surface-no-ip-rate-limiting`)
- **Severity:** High
- **Vulnerability class:** Missing rate limiting / brute-force protection on authentication endpoints
- **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling) / CWE-307 (Improper Restriction of Excessive Authentication Attempts)
- **CVSS v3.1 (est.):** 7.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N` (unauthenticated abuse of platform mail relay and token oracle)
- **PoC status:** `executed` (real-environment reproduction against local workerd)
- **Authentication required:** None (anonymous)

## Summary

The Worker configuration promises per-IP brute-force protection on the authentication API — a `wrangler.toml` comment states *"10 requests per minute per IP — brute force protection"* and declares `AUTH_RATE_LIMITER` and `ADMIN_RATE_LIMITER` rate-limit bindings — but **no handler code ever references either binding**. They are dead configuration. The only throttle on OTP issuance is a per-email D1 `COUNT` keyed on the attacker-chosen `email` field, which is trivially defeated by rotating victim addresses. In the shipped default posture (`TURNSTILE_SECRET_KEY` unset), the Turnstile bot gate is also silently skipped, so nothing at all throttles a single source IP.

The demonstrated effect: one client IP relayed **15 OTP emails in under 60 seconds** through the platform's own `EMAIL` binding with zero `429` responses, and then hammered the `/api/auth/verify-session` token-validity oracle 12 times — again with zero `429`s. This exceeds the documented 10 req/min/IP limit by 50% with no throttling whatsoever.

## Details

Three independent gaps combine into a single missing-control finding:

1. **Declared-but-unreferenced rate limiter bindings.** `wrangler.toml` declares both limiters:

   ```toml
   # Rate limiting for auth API (10 requests per minute per IP - brute force protection)
   [[ratelimits]]
   name = "AUTH_RATE_LIMITER"
   namespace_id = "1002"
   simple = { limit = 10, period = 60 }
   ```

   The bindings appear in the `Env` type at [`site/workers/src/api.ts` (lines 25–26)](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/api.ts#L25-L26) — and nowhere else in `src/`. `grep -r AUTH_RATE_LIMITER site/workers/src` returns only the type declarations; there are **zero `.limit()` call sites**. The same holds for `ADMIN_RATE_LIMITER`.

2. **Per-email throttle is attacker-keyed, not IP-keyed.** The only brake on `POST /api/auth/send-code` is a D1 count of recent codes *for the requested email address* in [`site/workers/src/handlers/auth.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts):

   ```ts
   const recent = yield* Effect.tryPromise({
     try: () =>
       env.DB.prepare(
         `SELECT COUNT(*) as count FROM auth_codes
          WHERE email = ? AND created_at > datetime('now', '-10 minutes')`
       )
         .bind(body.email)
         .first(),
     catch: cause => new AuthStoreUnavailable('countRecentCodes', cause),
   }).pipe(/* ... */);
   if (recent.count >= 3) {
     yield* Effect.fail(new AuthRateLimitedError());
   }
   ```

   The `email` field is fully attacker-controlled. Rotating `victim-1@`, `victim-2@`, … never trips the counter, so the per-email "3 per 10 minutes" budget imposes no per-IP ceiling at all.

3. **Turnstile gate fails open in the default configuration.** `requireTurnstile` (auth.ts, line ~180) short-circuits when the secret is unset:

   ```ts
   if (env.TURNSTILE_SECRET_KEY === undefined || env.TURNSTILE_SECRET_KEY.length === 0) {
     // skip verification entirely
   }
   ```

   With `TURNSTILE_SECRET_KEY` unset (the shipped default), the CAPTCHA layer contributes nothing, leaving the send-code guard stack at "Layer-2 only, partial" with no Layer-1 (edge/IP) or Layer-3 (dispatcher-wide) guard anywhere in the request path.

The result is an unauthenticated attacker with a single IP who can (a) relay unlimited OTP emails through the platform's mail domain, (b) enumerate registered users via response deltas across arbitrary email addresses, and (c) use `/api/auth/verify-session` as an unthrottled token-validity oracle.

## Root Cause

A configuration/documentation drift: rate-limit bindings were provisioned in [`site/workers/wrangler.toml`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/wrangler.toml) (with an explicit security-intent comment) and typed into the `Env` interface, but the wiring step — calling `env.AUTH_RATE_LIMITER.limit({ key: ip })` inside the `send-code`, `verify-code`, and `verify-session` handlers — was never implemented. The per-email D1 count was left as the sole guard, and it keys on attacker-controlled input rather than `CF-Connecting-IP`. The fail-open default in `requireTurnstile` removes the last potential brake in the default posture. A missing control that exists only as configuration prose is invisible to structural SAST, which is why it survived automated scanning.

## Proof of Concept (PoC)

The PoC script at `piolium/findings/p10-002-auth-surface-no-ip-rate-limiting/poc.sh` runs against the production Worker source served by `wrangler dev 4.125.0` (local workerd, D1 migrations `0000..014` applied, `EMAIL` send_email binding simulated, `TURNSTILE_SECRET_KEY` unset — the shipped default). It:

1. Fires 15 `POST /api/auth/send-code` requests from one IP (`CF-Connecting-IP: 203.0.113.7`), rotating a fresh victim email per request to bypass the per-email D1 counter.
2. Fires 12 `POST /api/auth/verify-session` requests with guessed tokens from the same IP.

Observed output (`evidence/exploit.log`), quoted verbatim:

```
send-code #01 -> HTTP 200 {"success":true,"message":"Verification code sent"}
send-code #02 -> HTTP 200 {"success":true,"message":"Verification code sent"}
...
send-code #15 -> HTTP 200 {"success":true,"message":"Verification code sent"}
[*] Successful OTP sends from single IP: 15/15 (documented limit: 10/min/IP)
[*] Hammering /api/auth/verify-session token oracle 12x from same IP...
[*] verify-session responses: 401s only; 429 rate-limits observed: 0
{"status": "confirmed", "evidence": "15 OTP emails relayed from one IP in <60s with zero 429s (documented AUTH_RATE_LIMITER limit: 10/min/IP, binding never invoked)"}
```

The worker-side mail binding log (`evidence/setup.log`) corroborates that the OTPs were genuinely dispatched through the platform's `EMAIL` binding:

```
[wrangler:info] Ready on http://localhost:8799
send_email binding called with MessageBuilder:
send_email binding called with MessageBuilder:
...
```

and the impact capture (`evidence/impact.log`) records `"emails_relayed": 15` with `"send_email binding invocations during exploit window: 32"`.

## Impact

**Observed (from the executed PoC):** a single unauthenticated IP relayed 15 OTP emails in under 60 seconds — 50% over the documented 10/min/IP limit — and received zero `429` responses across 27 total auth-surface requests. Every request returned `HTTP 200` (send-code) or `HTTP 401` (verify-session).

**Inferred impact at scale (high confidence, direct consequence of the missing control):**

- **Email bombing / mail-reputation abuse.** The platform's own domain and `EMAIL` binding become a free, unthrottled mail-relay for an attacker, poisoning sender reputation and risking provider suspension of the mail integration.
- **Cross-email user enumeration.** Response deltas across arbitrary addresses allow bulk enumeration of registered users, with no per-IP budget to slow harvesting.
- **Unthrottled token oracle.** `/api/auth/verify-session` can be hammered without limit to probe token validity; combined with the per-code 5-attempt budget on `verify-code`, a single IP retains full brute-force throughput against targeted OTPs.
- **Defense-in-depth collapse in the default posture.** With Turnstile skipped by default, the documented rate limiter was the intended last line of defense on the auth surface; its absence means the auth API effectively has *no* abuse controls out of the box.

## Remediation

1. **Wire the bindings.** Call `env.AUTH_RATE_LIMITER.limit({ key: clientIp })` at the top of the `send-code`, `verify-code`, and `verify-session` handlers, keyed on `CF-Connecting-IP`; do the same for `ADMIN_RATE_LIMITER` on admin routes. Reject with `429` when `limit.success` is `false`.
2. **Fail closed when the binding is absent.** If `env.AUTH_RATE_LIMITER` is `undefined` (e.g., local dev or misconfigured deploy), either reject the request or apply an in-Worker fallback limiter — do not silently allow unlimited traffic.
3. **Fix the per-email counter's keying.** Keep the per-email count as an additional guard, but add a per-IP counter on `send-code` (e.g., a D1/KV table keyed on `CF-Connecting-IP` with a 10/minute window) so rotating victim addresses cannot bypass throttling.
4. **Fail closed on Turnstile.** When `TURNSTILE_SECRET_KEY` is unset in a production environment, refuse OTP issuance rather than skipping verification; alternatively enforce the limiter unconditionally so the CAPTCHA is defense-in-depth, not the only gate.
5. **Align docs and config.** If per-IP limiting is intentionally not implemented, delete the `AUTH_RATE_LIMITER`/`ADMIN_RATE_LIMITER` bindings and correct the `wrangler.toml` comment so the documented security posture matches reality.

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:08:53Z
Confirm-Evidence: piolium/findings/p10-002-auth-surface-no-ip-rate-limiting/evidence/confirmed-20260823T090852Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: 15 OTP emails relayed from one IP in <60s with zero 429s (documented AUTH_RATE_LIMITER limit: 10/min/IP, binding never invoked)
