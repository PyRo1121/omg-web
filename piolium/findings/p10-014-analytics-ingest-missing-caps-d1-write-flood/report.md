# [HIGH] Unauthenticated D1 Write Flood via `/api/analytics` — No Batch Cap, Payload Cap, Rate Limit, or Truncation

**Vulnerability class:** Uncontrolled resource consumption / denial of service
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
**Severity:** High
**PoC status:** Executed against a real Worker runtime (`wrangler dev`/workerd + local D1)

## Summary

`POST /api/analytics` on the SaaS Worker accepts arbitrarily large, fully anonymous analytics batches and fans each event out into up to 5 writes against the shared Cloudflare D1 database `omg-platform`. Unlike its three sibling telemetry routes, this handler enforces **no batch-size limit, no request-body size limit, no rate limit, and no string-length truncation**, and events submitted without a `license_key` bypass the telemetry ingestion policy entirely. A single unauthenticated HTTP request can therefore consume thousands of D1 row-writes with attacker-chosen dimension keys and store multi-megabyte attacker-controlled blobs. Because `omg-platform` is the single D1 database shared by both Workers on the Free plan, exhausting the daily rows-written quota degrades every platform write — OTP codes, sessions, licensing, Stripe projections — until the UTC quota reset.

## Details

Three sibling telemetry routes each defend the same sink that `/api/analytics` leaves wide open:

| Control | `/api/cli/batch` | `/api/docs/analytics` | `/api/site/analytics/track` | **`/api/analytics`** |
|---|---|---|---|---|
| Content-Length cap | 1 MiB | — | — | **none** |
| Batch-size cap | truncation | 50 events | 50 events | **none** |
| Rate limiter | per-license | per-IP | per-IP | **none** |
| String truncation | yes | — | — | **none** |
| Credential required | license key | no | no | **no** |

The contract for `/api/analytics` declares an unbounded events array, and every string field carries only a `minLength(1)` constraint with no `maxLength`:

```ts
// site/workers/src/contracts/license-ops.ts (AnalyticsEventSchema / AnalyticsBatchSchema)
export const AnalyticsBatchSchema = Schema.Struct({
  events: Schema.optional(Schema.Array(AnalyticsEventSchema)),
});
```

The body decoder calls `request.json()` with **no Content-Length check and no size gate**, so multi-megabyte bodies are parsed normally:

```ts
// site/workers/src/body.ts (decodeJsonBody)
return tryPromise({
  try: () => request.json(),
  catch: cause => new InvalidJsonBodyError('Body is not valid JSON', cause),
}).pipe(
```

[`ingestAnalytics`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts) iterates the full array without any `events.length` check. Events with `license_key === undefined` skip the telemetry policy resolution and are pushed straight into the ingest set:

```ts
const requestedEvents = body.events === undefined ? [] : body.events;
if (requestedEvents.length === 0) {
  return { success: true as const, processed: 0 };
}
...
for (const event of requestedEvents) {
  if (event.license_key === undefined) {
    events.push(event);
    continue;
  }
  ...
}
```

Each event then generates write amplification in [`ingestAnalytics`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts): one insert into `analytics_events` (with the `properties` JSON stored verbatim), plus — for every `command` event — four daily-metric upserts keyed on attacker-chosen dimensions:

```ts
statements.push(
  env.DB.prepare(
    `INSERT INTO analytics_events (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(..., JSON.stringify(event.properties === undefined ? {} : event.properties), ...)
);
if (event.event_type === 'command') {
  statements.push(incrementDailyMetric(env.DB, today, 'commands', event.event_name, 1));
  statements.push(incrementDailyMetric(env.DB, today, 'total_commands', 'all', 1));
  statements.push(incrementDailyMetric(env.DB, today, 'platform', event.platform, 1));
  statements.push(incrementDailyMetric(env.DB, today, 'version', event.version, 1));
}
```

Because the daily metrics are keyed on `(date, metric, dimension)`, giving each event a unique `event_name` forces one distinct row per event. Every `error` event additionally upserts into `analytics_errors` keyed on the attacker-chosen error message, plus one more daily-metric row per distinct `error_type`, and every distinct `machine_id` adds an `analytics_active_users` row. The whole array is flushed through a single unbounded [`env.DB.batch(statements)`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts). Finally, no `API_RATE_LIMITER` call exists anywhere in `handlers/license.ts` — sibling routes call it at their respective handlers; this one does not.

## Root Cause

A missing-controls asymmetry: when the telemetry endpoints were hardened, `/api/analytics` was left out. Concretely:

1. `AnalyticsBatchSchema.events` has no `maxItems`, and all string fields lack `maxLength` ([contracts/license-ops.ts](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/contracts/license-ops.ts)).
2. [`decodeJsonBody`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/body.ts) performs no Content-Length or body-size check before `request.json()`.
3. [`ingestAnalytics`](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/src/handlers/license.ts) never validates `events.length` before building the statement fan-out.
4. The handler invokes no rate limiter.
5. Anonymous ingestion (`license_key` optional) lets any internet client reach the sink.

This is invisible to injection/taint-style SAST because the defect is purely an *absence* of controls on a fully parameterized write path; the asymmetry only appears when diffing handlers against their siblings.

## Proof of Concept (PoC)

The reproduction script is at `piolium/findings/p10-014-analytics-ingest-missing-caps-d1-write-flood/poc.sh`; execution logs are under `evidence/`. Environment: Cloudflare Workers via `wrangler dev` (workerd, wrangler 4.125.0) on `http://127.0.0.1:8814`, local D1 `omg-platform` with migrations applied. No credentials or `license_key` used anywhere.

1. Build a batch of **120 anonymous `command` events** (each with a unique `event_name`) and `POST` it to `/api/analytics`. Observed (`evidence/exploit.log`):

   ```
   batch response: HTTP 200 {"success":true,"processed":120}
   ```

   Both sibling analytics routes would have capped this at 50 events.

2. `POST` a single event whose `properties.blob` is a ~2 MiB string. Observed:

   ```
   fat response: HTTP 200 {"success":true,"processed":1}
   ```

   The sibling route `/api/cli/batch` rejects bodies over 1 MiB at a Content-Length gate; this payload was accepted and persisted verbatim.

3. Burst five rapid anonymous batches from one IP. Observed:

   ```
   burst HTTP codes: 200 200 200 200 200 (no 429 anywhere)
   ```

## Impact

Measured D1 impact from the two requests above (`evidence/impact.log`):

```json
{ "tbl": "analytics_events", "rows_written": 121 },
{ "tbl": "analytics_daily_distinct_rows", "rows_written": 120 },
{ "tbl": "fat_blob_bytes", "rows_written": 2097163 },
{ "tbl": "active_users_rows", "rows_written": 1 }
```

One unauthenticated 120-event request produced ~605 statements through a single `env.DB.batch()` call (120 inserts + 480 attacker-keyed daily upserts + the fat-payload event), and stored a 2,097,163-byte TEXT value.

Inferred production impact: Workers request bodies may be far larger than what was tested, so scaling to tens of thousands of events per request (5 writes each) makes exhausting the Free-plan D1 daily rows-written quota trivially achievable from a single machine — or a small rotating IP set, since no limiter exists. The database [is shared by the site and SaaS Workers](https://github.com/PyRo1121/omg-web/blob/6eb3c8eb5877fd1ab3b2a640ea4fa667555d7e86/site/workers/wrangler.toml):

> The site and SaaS Worker share the final D1 slot available on the Free plan.
> Better Auth owns user/session/account/verification; this Worker owns all other tables.

Once the quota is exhausted, **all** platform writes fail until the UTC quota reset — including OTP codes, session creation, licensing operations, and Stripe projections. This converts a cheap, anonymous, single-request-shaped attack into a full-day outage of the authentication and monetization plane. The same uncapped path also enables gradual storage-quota exhaustion via multi-megabyte verbatim-persisted `properties` payloads.

## Remediation

Mirror the controls already proven on the sibling telemetry routes:

1. Enforce `events.length <= 100` (or match siblings' 50) in `ingestAnalytics` and add a Content-Length / body-size cap (~1 MiB) before `request.json()` in `decodeJsonBody`.
2. Add `maxLength` constraints to all string fields in `AnalyticsEventSchema` (notably `event_name`, `error_message` inputs, `machine_id`, `platform`, `version`) and truncate `properties` before persistence, as `/api/cli/batch` does with `truncateString`.
3. Call `env.API_RATE_LIMITER` per-IP (and optionally per-license) in `handleAnalytics`.
4. Consider requiring a valid `license_key` for `command`/`error` event types so the highest-amplification paths cannot be driven anonymously.

Confirm-Status: confirmed-live
Confirm-Timestamp: 2026-08-23T09:08:58Z
Confirm-Evidence: piolium/findings/p10-014-analytics-ingest-missing-caps-d1-write-flood/evidence/confirmed-20260823T090857Z.log
Confirm-Variant-Count: 1
Confirm-FpCheck: not-run
Confirm-Notes: unauthenticated batch of 120 events accepted (sibling routes cap at 50), fanning out ~600 D1 statements; separate ~2 MiB payload accepted past the 1 MiB sibling gate
