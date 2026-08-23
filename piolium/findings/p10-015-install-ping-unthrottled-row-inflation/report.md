# [p10-015] Unthrottled Anonymous Row Inflation via `/api/install-ping` Poisons the Public Installs Badge

**Severity:** Medium
**Type:** Missing rate limiting / resource exhaustion (data inflation)
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
**PoC Status:** executed (real workerd/D1 environment)

## Summary

`POST /api/install-ping` — the anonymous first-run telemetry endpoint called by the CLI — accepts any attacker-chosen `install_id` string of length ≥ 1 and durably inserts one row into the shared D1 database per unique id. The route has **no authentication, no Turnstile challenge, no per-IP rate limiter**, and its body schema enforces **no maximum length on any field**. An anonymous attacker can therefore loop requests to (a) drain the platform's shared Free-plan D1 rows-written quota and grow storage without bound, and (b) directly inflate `COUNT(DISTINCT install_id)` — the number served publicly by `GET /api/badge/installs` as a marketing badge. This was confirmed in a live workerd + D1 environment: 25 unauthenticated requests inflated the public badge from 1 to 27.

## Details

The endpoint is intentionally public — it exists so the CLI can record an install on first run without credentials. However, nothing distinguishes a real CLI ping from an arbitrary scripted request:

1. **Dispatch has no guard stack.** In [worker.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/worker.ts), the `/api/install-ping` case routes directly to the handler. `API_RATE_LIMITER` is not referenced anywhere in [`handlers/license.ts`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts) — no limiter, no CAPTCHA, no IP dedup.

2. **The body schema only requires non-emptiness.** In [license.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L754-L761):

   ```ts
   /** The install ping payload sent by the CLI on first run. */
   const InstallPingBodySchema = Schema.Struct({
     install_id: Schema.String.pipe(Schema.minLength(1)),
     timestamp: Schema.optional(Schema.String),
     version: Schema.optional(Schema.String),
     platform: Schema.optional(Schema.String),
     backend: Schema.optional(Schema.String),
   });
   ```

   There is no `maxLength`, no UUID format check, and the optional `version` / `platform` / `backend` strings are entirely uncapped.

3. **Every unique id becomes a durable row.** The handler writes straight through to D1 ([license.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts#L779-L786)):

   ```ts
   env.DB.prepare(
     `INSERT OR IGNORE INTO install_stats (id, install_id, version, platform, backend, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
   )
     .bind(crypto.randomUUID(), body.install_id, version, platform, backend)
     .run(),
   ```

   Per the [baseline migration](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/migrations/0000_current_baseline.sql#L451-L459), `install_id TEXT UNIQUE NOT NULL` is the only constraint — uniqueness of an attacker-supplied string is effectively the sole write gate:

   ```sql
   CREATE TABLE IF NOT EXISTS install_stats (
     id TEXT PRIMARY KEY,
     install_id TEXT UNIQUE NOT NULL,
     version TEXT,
     platform TEXT,
     backend TEXT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   ```

4. **The poisoned data is published publicly.** [`GET /api/badge/installs`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/worker.ts#L87-L121) computes `SELECT COUNT(DISTINCT install_id) as total FROM install_stats` and serves it as a shields-style badge with `Cache-Control: public, max-age=60, must-revalidate`. Every fake row counts toward the advertised install total.

Why SAST missed it: the INSERT is fully parameterized with no injection surface; the defect is the *absence* of throttling and length caps on an intentionally open endpoint, which structural rules cannot see.

## Root Cause

The `/api/install-ping` route trusts that only well-behaved CLI clients will call it. Concretely, three independent mitigations are all missing at once:

- No invocation of `env.API_RATE_LIMITER` (the binding exists but is unused on this route).
- No `maxLength` / format constraints in `InstallPingBodySchema` (`install_id`, `version`, `platform`, `backend` are all unbounded).
- No sanitization or abuse filtering between raw `install_stats` rows and the public badge aggregate.

Any one of these would have blunted the attack; their combined absence makes every unique attacker-chosen id a permanent, quota-consuming, badge-counted row.

## Proof of Concept (PoC)

The runnable script is at `piolium/findings/p10-015-install-ping-unthrottled-row-inflation/poc.sh` (mirrored in `evidence/exploit.sh`). It targets a stock `wrangler dev` workerd instance with production source unmodified (`evidence/env-info.txt`: wrangler 4.125.0, D1 "omg-platform", migrations applied).

Steps:

1. Read the current badge: `GET /api/badge/installs` → `"message": "1"`.
2. Send 25 unauthenticated pings, each with a fresh random UUID:
   ```bash
   curl "$BASE/api/install-ping" -X POST -H 'content-type: application/json' \
     -d "{\"install_id\":\"$(uuidgen)\",\"version\":\"9.9.9-fake\",\"platform\":\"poc\"}"
   ```
   All 25 return HTTP 200 with no auth header ever sent.
3. Re-send one fixed id six times — replays are ignored by `INSERT OR IGNORE` (proving uniqueness of attacker-chosen ids is the only gate), while the *first* insert still counts.
4. Re-read the badge after cache expiry.

Observed output (`piolium/findings/p10-015-install-ping-unthrottled-row-inflation/evidence/exploit.log`):

```
[*] Badge before attack: 1
[*] Sent 25 unique-id pings: HTTP 200 x25 (no auth header ever sent)
[*] Badge after attack:  27

=== Result ===
public installs badge inflated by exactly 26 after 25 unauthenticated requests
(delta = 25 fresh ids + 1 first insert of the replayed id; replays 2-6 were ignored)
```

A follow-up query against local D1 (`evidence/impact.log`) confirmed the rows persisted with attacker-controlled fields (`version: "9.9.9-fake"`, `platform: "poc"`), and a single request carrying a 100 KiB `version` plus two 50 KiB fields was accepted and stored verbatim:

```
"install_id": "poc-fat-field-0001",
"version_len": 100000,
"platform_len": 50000,
"backend_len": 50000
```

Scaling the loop (the PoC used N=25 purely for speed) gives linear inflation: 10k requests ≈ 10k fake installs and ≈ 10k consumed rows-written units.

## Impact

- **Public metric poisoning (observed).** Fake installs flow straight into the badge served at `/api/badge/installs` with a public 60-second cache. Anyone can inflate the project's advertised install count arbitrarily, which damages the credibility of a public marketing signal and misleads prospective users and contributors.
- **Quota drain and unbounded storage growth (observed mechanism, scaled impact inferred).** Each unique-id request writes one row into the shared D1 database. Under Cloudflare's plan-tier daily rows-written limits, an anonymous loop can exhaust the write budget available to *all* platform features sharing that database, degrading unrelated licensed functionality. The uncapped string fields amplify storage cost (~200 KB accepted per request in testing).
- **Zero cost to the attacker.** No account, token, CAPTCHA, or IP identity is required; requests are trivially parallelizable from any network.

Severity is Medium rather than High because the effect is gradual quota consumption and data-integrity damage rather than immediate outage or data exposure — but the blast radius includes any feature sharing the D1 database's write quota.

## Remediation

1. **Rate-limit per IP**: invoke `env.API_RATE_LIMITER` (already bound in [wrangler.toml](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/wrangler.toml#L34-L35) as namespace 1003) before the insert in `handleInstallPing`.
2. **Cap field lengths in the schema**: add `Schema.maxLength(...)` constraints (e.g., `install_id` ≤ 64 with UUID format validation; `version` ≤ 32; `platform` / `backend` ≤ 64).
3. **Harden the badge aggregate**: compute the public install count from a sanitized view (e.g., per-IP install dedup window, minimum-age filter, or a periodically recomputed counter) instead of raw `COUNT(DISTINCT install_id)` over attacker-writable rows.

Confirm-Timestamp: 2026-08-23T09:09:01Z
Confirm-Evidence: piolium/findings/p10-015-install-ping-unthrottled-row-inflation/evidence/confirmed-20260823T090858Z.log
Confirm-Variant-Count: 2
Confirm-FpCheck: not-run
Confirm-Notes: ok=25 before=53 after=78 delta=25
Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:15:29Z
Confirm-Evidence: piolium/findings/p10-015-install-ping-unthrottled-row-inflation/evidence/confirmed-20260823T091528Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: public installs badge inflated by 26 (=25 fake installs) via 25 unauthenticated POST /api/install-ping requests
