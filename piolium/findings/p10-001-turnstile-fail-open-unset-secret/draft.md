---
id: p10-001
phase: P10
sequence: 1
slug: turnstile-fail-open-unset-secret
status: valid
verdict: VALID
severity: medium
title: Turnstile bot protection silently disabled when TURNSTILE_SECRET_KEY is unset
original: p4-001-turnstile-fail-open.md
debate: piolium/chamber-workspace/C1-auth-otp-abuse/debate.md
---

## Summary

`requireTurnstile()` in `site/workers/src/handlers/auth.ts` returns `Effect.void`
(skips verification entirely) when `env.TURNSTILE_SECRET_KEY` is `undefined` or empty:

```ts
if (env.TURNSTILE_SECRET_KEY === undefined || env.TURNSTILE_SECRET_KEY.length === 0) {
  return Effect.void;
}
```

This is a fail-open insecure default on the sole bot/abuse gate protecting the
unauthenticated OTP send path (`POST /api/auth/send-code`). Any environment where the
secret is missing — new staging envs, wrangler dev, a deleted secret during rotation,
or a misconfigured deploy — silently downgrades to no CAPTCHA at all. No warning is
logged and responses are identical to the protected case.

## Attack path

With verification disabled, the remaining control is a per-email count limit of
3 codes / 10 minutes (`auth_codes` COUNT query). An attacker can:

1. **Email bombing**: rotate victim emails to send OTP emails at scale (bounded only
   per-email), damaging deliverability of `noreply@latham.cloud`.
2. **OTP brute-forcing assist**: script verify-code attempts; the 6-digit code with
   5-attempt cap per code is otherwise infeasible, but automation removes all friction
   above the crypto margin.

## Notes

- Fail-open pattern flagged by Phase 3 sharp-edges sweep ("three fail-open controls").
- The same fail-open shape exists for other optional gates; this instance matters most
  because it fronts account authentication.

## Recommended direction

Fail closed (or degrade loudly) in production: require the secret when
`ENVIRONMENT=production`, emit `reportError`/Sentry event on skip, and surface config
drift at deploy time (`check:deploy`).

## Classification

Likely security, conditional on environment configuration drift. Kept because the
failure mode is silent and the affected endpoint issues credentials.

---

## PoC (Phase 13)

PoC-Status: executed
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous

Executed against the real Worker in workerd (`@cloudflare/vitest` pool, local D1
seeded with the production migration baseline), simulating the documented default
posture where `TURNSTILE_SECRET_KEY` is optional/unset. Artifacts:

- `poc.test.ts` — minimized exploit (4 probes: fail-open, empty-string secret,
  configured-secret control, 5-email abuse primitive)
- `poc.sh` / `evidence/exploit.sh` — runner; last stdout line is the structured verdict JSON
- `evidence/` — setup.sh, setup.log, healthcheck.log, exploit.log, impact.md,
  markers.txt, env-info.txt

Observed: `POST /api/auth/send-code` with NO turnstileToken returns `200 {success:true}`
and issues an OTP row when the secret is unset or empty; the identical request is
rejected `400 "Security verification required"` once a secret is configured — proving
the secret's presence is the only variable gating the bot check, and that drift is silent.
