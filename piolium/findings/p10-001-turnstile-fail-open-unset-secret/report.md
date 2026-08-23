# Turnstile Bot Protection Silently Disabled When `TURNSTILE_SECRET_KEY` Is Unset

**Severity:** Medium
**Vulnerability class:** Insecure default / fail-open access control (CWE-1188)
**Status:** Executed PoC — confirmed against the real Worker in workerd

## Summary

`requireTurnstile()` in the Cloudflare Worker authentication handler skips Cloudflare Turnstile verification entirely — returning success without any check, log line, or error — whenever the environment binding `TURNSTILE_SECRET_KEY` is `undefined` or an empty string. This is a fail-open insecure default on the sole bot/abuse gate protecting the unauthenticated OTP issuance endpoint `POST /api/auth/send-code`. Any deployment where the secret is missing or empty — fresh staging environments, local `wrangler dev`, a deleted secret mid-rotation, or a misconfigured deploy — silently degrades to no CAPTCHA at all. Responses are byte-identical to the protected case, so operators receive no signal that protection is off.

An executed proof of concept against the real workerd runtime with production D1 migrations demonstrated that `POST /api/auth/send-code` returns `200 {"success":true}` and issues an OTP row **with no `turnstileToken` in the request body** when the secret is unset, while the identical request is rejected with `400 "Security verification required"` once a secret is configured.

## Details

The endpoint's only automated-abuse defense before OTP issuance is the Turnstile check performed inside `requireTurnstile()`. The guard's first branch treats a missing/empty secret as "verification not applicable" and short-circuits to success:

```ts
function requireTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
  email: EmailAddress
): Effect.Effect<
  void,
  TurnstileRequiredError | TurnstileFailedError | TurnstileVerificationUnavailable
> {
  if (env.TURNSTILE_SECRET_KEY === undefined || env.TURNSTILE_SECRET_KEY.length === 0) {
    return Effect.void;
  }
  if (token === undefined || token.length === 0) {
    return Effect.fail(new TurnstileRequiredError());
  }
  ...
```

Source: [`site/workers/src/handlers/auth.ts`, lines 186–201](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L186-L201).

Note the asymmetry: when the secret **is** present but the token is missing, the code correctly fails with `TurnstileRequiredError`. The presence of the secret alone — not any property of the incoming request — decides whether bot protection exists at all.

`sendVerificationCode()` invokes this guard immediately after JSON decoding and before the per-email rate limit:

```ts
const body = yield* decodeJsonBody(request, SendCodeRequestSchema);
yield* requireTurnstile(request, env, body.turnstileToken, body.email);
```

Source: [`site/workers/src/handlers/auth.ts`, lines 225–226](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts#L225-L226).

Because the skip branch returns `Effect.void` without writing an audit event or emitting an error-reporting signal, configuration drift is invisible both to attackers (who see no difference) and to operators (who get no warning). The failure mode is therefore silent by construction.

## Root Cause

A fail-open design decision: an *optional* configuration value (`TURNSTILE_SECRET_KEY`) controls whether a *security control* runs, and absence of the value is interpreted as "control disabled" rather than as a configuration error. There is no environment-aware policy (e.g., requiring the secret when `ENVIRONMENT=production`), no loud degradation path (error reporting/Sentry event on skip), and no deploy-time validation that would catch drift before traffic flows.

## Proof of Concept (PoC)

The exploit script is [`piolium/findings/p10-001-turnstile-fail-open-unset-secret/poc.test.ts`](piolium/findings/p10-001-turnstile-fail-open-unset-secret/poc.test.ts) (runner: [`poc.sh`](piolium/findings/p10-001-turnstile-fail-open-unset-secret/poc.sh)), executed under `@cloudflare/vitest`'s workerd pool against local D1 seeded with the production migration baseline. It runs four probes:

1. **Probe A (fail-open):** set `env.TURNSTILE_SECRET_KEY = undefined`; POST `/api/auth/send-code` with body `{"email":"victim-a@anywhere.test"}` and **no** `turnstileToken`.
2. **Probe B (empty string):** same request with `TURNSTILE_SECRET_KEY = ''`.
3. **Probe C (control):** set `TURNSTILE_SECRET_KEY = 'real-secret-configured'`; repeat the identical token-less request.
4. **Probe D (impact primitive):** with the secret unset, send codes to five distinct victim emails with no tokens.

Decisive results from [`evidence/exploit.log`](piolium/findings/p10-001-turnstile-fail-open-unset-secret/evidence/exploit.log):

```
P10-001-RESULT A_status=200
P10-001-RESULT A_success=true
P10-001-RESULT A_otp_row_issued=true
P10-001-RESULT B_status=200
P10-001-RESULT C_control_status=400
P10-001-RESULT C_control_error="Security verification required"
P10-001-RESULT D_statuses=200,200,200,200,200
P10-001-RESULT D_delivered=5/5
P10-001-RESULT D_otp_rows=5
```

And the structured verdict line emitted by the runner:

```json
{"status": "confirmed", "evidence": "send-code returned 200 + issued OTP row with NO turnstileToken while TURNSTILE_SECRET_KEY unset; identical request rejected 400 once secret is configured", "notes": "real workerd stack, production D1 migrations"}
```

Probes A and B show unauthenticated OTP issuance with zero bot-protection input; probe C proves the secret's presence is the *only* variable gating the check; probe D demonstrates the resulting abuse primitive end-to-end.

## Impact

With verification disabled, the remaining friction on the unauthenticated send path is only a per-email limit (3 codes per 10 minutes via an `auth_codes` COUNT query). An attacker can then:

- **Email bombing:** rotate across arbitrary victim addresses to drive large volumes of OTP email from `noreply@latham.cloud`, damaging the sending domain's deliverability and reputation (probe D showed 5/5 successful sends across distinct emails).
- **OTP brute-force assist:** scripted verification attempts remove all human/automation friction above the cryptographic margin; the per-code 5-attempt cap remains, but the attacker can freely mint new codes for new attempts within the rate limits.

Environments most at risk are non-production deployments that share the production domain behavior, and any production incident where the secret is accidentally deleted during rotation — since drift produces no log, alert, or behavioral difference, it can persist indefinitely. Severity is assessed as Medium because exploitation requires the configuration-drift precondition, but the affected endpoint issues authentication credentials and the failure is silent.

## Remediation

1. **Fail closed in production:** reject requests (or refuse to boot) when `ENVIRONMENT=production` and `TURNSTILE_SECRET_KEY` is missing/empty, rather than skipping verification.
2. **Degrade loudly elsewhere:** emit a `reportError`/Sentry event and audit-log entry every time verification is skipped due to missing configuration.
3. **Catch drift at deploy time:** extend the `check:deploy` pre-deploy validation to assert that `TURNSTILE_SECRET_KEY` is set for production environments.
4. Audit sibling optional gates for the same fail-open shape; prioritize any that front account authentication.

Confirm-Timestamp: 2026-08-23T09:08:52Z
Confirm-Evidence: piolium/findings/p10-001-turnstile-fail-open-unset-secret/evidence/confirmed-20260823T090849Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: vitest run failed - see exploit.log
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:11:30Z
Confirm-Evidence: piolium/findings/p10-001-turnstile-fail-open-unset-secret/evidence/confirmed-20260823T091105Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: send-code returned 200 + issued OTP row with NO turnstileToken while TURNSTILE_SECRET_KEY unset; identical request rejected 400 once secret is configured
