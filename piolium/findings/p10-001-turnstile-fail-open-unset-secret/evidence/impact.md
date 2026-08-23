# p10-001 Impact Evidence

Executed against the real Worker (workerd, @cloudflare/vitest pool) with the
production D1 migration baseline and the documented default posture
(`TURNSTILE_SECRET_KEY` optional/unset — docs/operations/cloudflare-environment-readiness.md).

## Observed results (evidence/exploit.log)

| Probe | Config | Request | Result |
|---|---|---|---|
| A — fail-open | secret unset (default) | POST /api/auth/send-code, no turnstileToken | 200 OK, `success:true`, OTP row issued in auth_codes |
| B — empty string | secret = "" | same | 200 OK (fail-open) |
| C — control | secret configured | same request, still no token | 400 "Security verification required" |
| D — abuse primitive | secret unset | 5 sends to 5 distinct victim emails | 5/5 delivered, 5 OTP rows |

## Security effect

The sole bot/abuse gate on the unauthenticated credential-issuing path silently
disappears when the optional secret is absent. Responses are byte-identical to
the protected case, so operators get zero signal of config drift. An attacker can:
1. Email-bomb arbitrary victims through noreply@latham.cloud (bounded only by the
   per-email 3/10min counter — rotate emails to bypass).
2. Script verify-code attempts with no CAPTCHA friction above the per-code
   5-attempt crypto margin.
