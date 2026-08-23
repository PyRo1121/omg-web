---
id: p10-014
phase: P10
sequence: 14
slug: analytics-ingest-missing-caps-d1-write-flood
status: verified-p11
verdict: VALID
severity: high
title: /api/analytics has no batch cap, payload cap, rate limit, or truncation — unauthenticated D1 write flood on shared Free-plan database
original: p8-001-analytics-ingest-missing-caps-d1-write-flood.md
debate: piolium/chamber-workspace/C5-resource-exhaustion/debate.md
---

## Summary

The KB (`knowledge-base-report.md`, Domain Attack Research, telemetry row) asserts batch caps
of "500 events/1MB" are enforced server-side. That is true for `/api/cli/batch`
(`telemetry.ts:15` `MAX_BATCH_PAYLOAD_BYTES = 1024*1024` + Content-Length gate `:34-48`) and
`/api/docs/analytics` (50-event cap, `docs-analytics.ts:63-66`) and `/api/site/analytics/track`
(`MAX_EVENTS_PER_BATCH = 50`, `site-analytics.ts:162,269`). It is **false** for
`POST /api/analytics` (`handlers/license.ts`):

- `AnalyticsBatchSchema` declares `events: Schema.optional(Schema.Array(AnalyticsEventSchema))`
  with **no `maxItems`** and every string field has only `minLength(1)` — no `maxLength`
  (`contracts/license-ops.ts:55-72`).
- `decodeJsonBody` calls `request.json()` with **no Content-Length check and no size cap**
  (`site/workers/src/body.ts:26-40`).
- `ingestAnalytics` iterates the full array with **no `events.length` check**
  (`license.ts:893-899`).
- **No rate limiter is invoked anywhere in `handlers/license.ts`** — grep shows
  `API_RATE_LIMITER` call sites only at `telemetry.ts:105`, `site-analytics.ts:258`,
  `docs-analytics.ts:45`.
- Events with `license_key === undefined` bypass the telemetry policy entirely and are
  ingested anonymously (`license.ts:905-908`).

Write amplification: every `event_type === 'command'` event emits **5 D1 statements**
(1 insert + 4 `analytics_daily` upserts keyed on attacker-distinct `event_name`,
'platform', 'version' dimensions — `license.ts:927-950`); every `error` event upserts
`analytics_errors` keyed on attacker-chosen `error_message` (`:952-961`) and one more
daily-metric row per distinct `error_type`. Every event adds a row to
`analytics_active_users` per distinct `machine_id` (`:967-974`).

Impact: the D1 database `omg-platform` is **shared by both workers on the Free plan**
(`workers/wrangler.toml:11-16` comment: "The site and SaaS Worker share the final D1 slot
available on the Free plan"). Free-plan D1 has a daily rows-written quota; a single
unauthenticated request can carry thousands of events (Workers request bodies allow up to
~100 MB), each producing 1–5 row writes and unbounded-length TEXT payloads
(`properties` JSON stored verbatim, `license.ts:935`). Exhausting the daily write quota
degrades **all** writes platform-wide — OTP codes, session inserts, licensing, Stripe
projection — until the UTC quota reset. This is an unauthenticated, single-request-shaped
availability attack on the authentication and monetization plane.

## Evidence (backward chain: sibling routes each defend; this one defends nothing)

| Control | /api/cli/batch | /api/docs/analytics | /api/site/analytics/track | **/api/analytics** |
|---|---|---|---|---|
| Content-Length cap | 1 MiB (`telemetry.ts:15,34`) | — | — | **none** |
| Batch-size cap | truncation | 50 (`docs-analytics.ts:63`) | 50 (`site-analytics.ts:269`) | **none** (`license.ts:893-899`) |
| Rate limiter | per-license (`telemetry.ts:105`) | per-IP (`docs-analytics.ts:45`) | per-IP (`site-analytics.ts:258`) | **none** |
| String truncation | `truncateString` (`telemetry.ts:56-88`) | — | — | **none** (schema `minLength(1)` only) |
| Credential required | license key | no | no | **no** (license_key optional, `license.ts:905-908`) |

- Sink: `env.DB.batch(statements)` with unbounded statement array — `license.ts:963-966`.
- Schema with no caps: `contracts/license-ops.ts:55-72` (read and verified).
- Shared-DB comment: `site/workers/wrangler.toml:11`.
- Contradiction check against KB claim "batch caps enforced server-side (500 events/1MB
  present)": refuted for this route — the caps exist on sibling routes only.

## Attack Steps

1. `POST https://omg-api.latham.cloud/api/analytics` with
   `{"events":[{"event_type":"command","event_name":"<unique-N>","session_id":"s","machine_id":"m","timestamp":"t","version":"v","platform":"p"}, …×N]}`
   (no `license_key`). N can be tens of thousands; each event yields 5 row writes.
2. Vary `event_name` per event to force one distinct `analytics_daily` row per event per day
   (upsert keys are `(date, metric, dimension)`), maximizing row-quota consumption.
3. Alternatively send few events with multi-megabyte `properties` objects (no length cap) to
   consume the 5 GB storage quota.
4. Repeat from rotating IPs; no limiter exists to stop it.

## Why This Passed SAST

The missing control is an *absence* (no maxItems, no Content-Length check, no limiter call)
in a handler whose query strings are fully parameterized — nothing for taint or injection
rules to flag. The asymmetry with sibling routes is only visible by diffing handlers.

## Recommended Fix

Mirror the sibling-route controls: enforce `events.length <= 100`, a Content-Length cap
(1 MiB), `maxLength` on all string fields, and call `env.API_RATE_LIMITER` per-IP (and/or
per-license) in `handleAnalytics`. Optionally require a valid `license_key` for
`command`/`error` event types.

Adversarial-Verdict: CONFIRMED
Adversarial-Rationale: Executed PoC accepted an anonymous 120-event batch (siblings cap at 50) producing 240+ D1 row-writes with attacker-chosen dimensions and a 200 KB untruncated stored string — no batch cap, size cap, or rate limiter exists on the path.
Severity-Final: high
PoC-Status: executed

## PoC (P13 writeback)

PoC-Status: executed
PoC-Block-Reason:
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous

Executed against the real production Worker (`wrangler dev`/workerd + local D1 `omg-platform`,
migrations applied). One unauthenticated request carrying 120 anonymous `command` events
(no `license_key` — telemetry policy bypassed) returned HTTP 200 `{"success":true,"processed":120}`
(sibling routes cap at 50). A second request with a ~2 MiB properties blob was accepted and
stored verbatim (2,097,163 bytes persisted; sibling `/api/cli/batch` rejects bodies > 1 MiB).
D1 impact verified post-exploit: 121 `analytics_events` rows, 120 distinct attacker-keyed
`analytics_daily` rows, ~605 statements fanned through a single `env.DB.batch()`. Five rapid
batches from one IP produced zero 429s (no `API_RATE_LIMITER` call site on this handler).
Evidence: `poc.sh`, `evidence/{setup,healthcheck,exploit,impact}.log`, `evidence/env-info.txt`.
