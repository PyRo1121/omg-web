# OTP Send-Code Rate Limit Is Check-Then-Insert — 3-per-10-Minutes Cap Bypassable Under Concurrency

**Vulnerability class:** Time-of-check-to-time-of-use (TOCTOU) race in quota enforcement
**CWE:** CWE-367 (Time-of-check Time-of-use TOCTOU Race Condition); related: CWE-770 (Allocation of Resources Without Limits)
**Severity:** Medium
**Affected surface:** `POST /api/auth/send-code` (anonymous endpoint, Cloudflare Worker + D1)
**PoC status:** `executed` — reproduced against the real worker in workerd with production D1 migrations

## Summary

The only functioning brake on OTP email sending is a D1 `COUNT(*)` of recent `auth_codes` rows compared against a cap of 3, followed — several async steps later — by an unconditional `INSERT`. The check and the write are separate round-trips with no transaction, no conditional insert, and no atomic counter, so N concurrent requests for one email all observe `count < 3` inside the window and all insert.

The attacker model is the anonymous internet. Two secondary controls on this path are absent or fail-open in the default configuration: the declared-but-unused `AUTH_RATE_LIMITER` binding is never invoked by any handler, and Turnstile verification fails open when `TURNSTILE_SECRET_KEY` is unset (the default posture). The result is a mailbox-bombing amplification primitive: a single burst of concurrent unauthenticated requests delivers dozens of OTP emails to a victim where the documented cap is 3 per 10 minutes.

This was confirmed empirically: 50 concurrent requests all returned HTTP 200 and produced 50 `auth_codes` rows within the quota window, while a sequential control correctly returned `200,200,200,429,429`.

## Details

The vulnerable logic lives in `sendVerificationCode` in [`site/workers/src/handlers/auth.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/auth.ts). The handler first performs a read-only quota check:

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

It then generates and mails the code, and only afterwards persists it via a separate batch:

```ts
yield* mailer(body.email, code);
yield* Effect.tryPromise({
  try: () =>
    env.DB.batch([
      env.DB.prepare(`UPDATE auth_codes SET used = 1 WHERE email = ? AND used = 0`).bind(
        body.email
      ),
      env.DB.prepare(
        `INSERT INTO auth_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), body.email, digest, expiresAt),
    ]),
  catch: cause => new AuthStoreUnavailable('replaceCode', cause),
});
```

Between the `SELECT COUNT(*)` and the `INSERT`, the request does real work: JSON body decoding, Turnstile verification, HMAC digest computation, code generation, and the mailer call. On Cloudflare Workers each request runs in its own isolate invocation with its own connection to D1; there is no lock, transaction spanning both statements, or atomicity guarantee that would serialize these steps across concurrent invocations. Every in-flight request therefore evaluates the same pre-insert count and passes the check.

The schema offers no compensating constraint. In [`site/workers/migrations/0000_current_baseline.sql`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/migrations/0000_current_baseline.sql), `auth_codes` is defined with no unique-per-window key or other admission predicate:

```sql
CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Two defense-in-depth layers that could have contained this race do not apply:

- **No IP-level rate limiter.** The `AUTH_RATE_LIMITER` binding is declared in the environment but no handler calls it on this path.
- **Turnstile fails open.** With `TURNSTILE_SECRET_KEY` unset (the default posture exercised by the PoC), bot verification imposes no cost or friction on the attacker.

## Root Cause

Classic TOCTOU: quota admission is split into an unconditional read (`SELECT COUNT(*) ...`) followed much later by an unconditional write (`INSERT INTO auth_codes ...`), with nothing binding the two together. Neither statement individually looks wrong — each is parameterized and syntactically correct — which is why static analysis did not flag it. The fix requires making admission itself atomic (see Remediation).

## Proof of Concept (PoC)

The exploit script is at `piolium/findings/p10-003-otp-send-quota-toctou/poc.test.ts`, runnable via `piolium/findings/p10-003-otp-send-quota-toctou/poc.sh`. It executes the **real** worker (`site/workers/src/worker.ts`) in workerd via the `@cloudflare/vitest-pool-workers` pool against local miniflare D1 seeded with the production migrations, under default configuration (`TURNSTILE_SECRET_KEY` unset; the `EMAIL` send binding is stubbed so each successful request corresponds 1:1 with an email handed off for delivery). No authentication is required.

The test has two phases:

1. **Control (sequential):** five serialized `POST /api/auth/send-code` calls for one email prove the cap works when there is no concurrency — statuses `200,200,200,429,429`.
2. **Exploit (concurrent):** 50 simultaneous requests for one victim email all read `count < 3` before any insert commits.

Decisive output from `evidence/exploit.log` / `evidence/impact.log`:

```text
p10-003 control sequential statuses: 200,200,200,429,429

p10-003 burst statuses x50: 200,200,200,... (all 50 requests returned HTTP 200)
p10-003 OTP emails delivered in single burst: 50 (documented cap: 3)

p10-003 auth_codes rows for victim within window: 50
p10-003 QUOTA_BYPASS_RATIO: 50/3
```

Ground truth was verified directly from D1 using the same window predicate the application uses (`created_at > datetime('now','-10 minutes')`) — 50 rows existed for the single victim address after one burst, versus the documented cap of 3.

## Impact

**Observed (from evidence logs):**

- A single anonymous concurrent burst of 50 requests produced 50 OTP email sends to one address — a **16.7× bypass** of the documented 3-per-10-minutes cap — while the sequential control confirms the race, not a missing limit, is the cause.

**Inferred impact (from observed primitive):**

- **Mailbox bombing / harassment:** an attacker can repeat bursts every 10 minutes for sustained inbox flooding of any chosen victim address. At scale this can fill quotas, bury legitimate messages, and constitute an effective denial of service for the victim's mailbox.
- **Sender-reputation and cost abuse:** mass OTP dispatch from the platform's mail provider risks deliverability blacklisting of the sending domain and inflates email and D1-write costs.
- **Unbounded amplification:** because the endpoint requires no authentication and Turnstile fails open by default, the attack costs the attacker only trivial request traffic.

Severity is assessed as **Medium**: the issue enables targeted abuse and resource amplification but does not compromise account integrity or expose data. (Note that the OTP codes themselves remain hashed at rest; this finding is confined to rate-limit enforcement.)

## Remediation

Make admission atomic rather than splitting it across a read and a later write. Replace the count-then-insert pair with a single conditional insert whose predicate re-evaluates the quota at write time:

```sql
INSERT INTO auth_codes (id, email, code, expires_at)
SELECT ?, ?, ?, ?
WHERE (
  SELECT COUNT(*) FROM auth_codes
  WHERE email = ? AND created_at > datetime('now', '-10 minutes')
) < 3;
```

Then gate both the mailer call and the success response on `meta.changes === 1` (return the existing `429` otherwise). This closes the race regardless of concurrency, since the check and the write occur in one D1 statement.

Defense-in-depth recommendations:

- Wire the declared-but-currently-unused `AUTH_RATE_LIMITER` binding as an IP-level pre-check ahead of the per-email quota, so bursts cannot even reach D1.
- Fail closed (or at least fail visibly) when `TURNSTILE_SECRET_KEY` is unset in production, so bot friction cannot silently disappear.

Confirm-Timestamp: 2026-08-23T09:08:53Z
Confirm-Evidence: piolium/findings/p10-003-otp-send-quota-toctou/evidence/confirmed-20260823T090853Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: no-structured-output
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:11:57Z
Confirm-Evidence: piolium/findings/p10-003-otp-send-quota-toctou/evidence/confirmed-20260823T091130Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: D1 contains 50 auth_codes rows for one email inside the 10-minute quota window after a single concurrent burst of send-code requests (sequential control correctly capped at 3 with HTTP 429)
