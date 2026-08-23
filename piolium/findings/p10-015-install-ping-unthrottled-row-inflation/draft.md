---
id: p10-015
phase: P10
sequence: 15
slug: install-ping-unthrottled-row-inflation
status: valid
verdict: VALID
severity: medium
title: /api/install-ping allows unthrottled anonymous row inflation and poisons the public installs badge
original: p8-002-install-ping-unthrottled-row-inflation.md
debate: piolium/chamber-workspace/C5-resource-exhaustion/debate.md
---

## Summary

`POST /api/install-ping` is fully anonymous by design (CLI first-run telemetry). The body
schema requires only `install_id` with `minLength(1)` — **no `maxLength`, no format check**
(`license.ts:754-761`) — and the handler performs `INSERT OR IGNORE INTO install_stats`
keyed on the attacker-chosen `install_id` (`license.ts:777-786`,
`migrations/0000_current_baseline.sql:452-459`: `install_id TEXT UNIQUE NOT NULL`). There is
**no rate limiter** on this route (`API_RATE_LIMITER` is not referenced anywhere in
`handlers/license.ts`; verified by grep), and the string fields `version`, `platform`,
`backend` are also uncapped.

Consequences:

1. **Quota drain**: every request with a fresh random `install_id` writes a new row into the
   shared Free-plan D1 (`wrangler.toml:11-16`). An anonymous loop drains the daily
   rows-written quota and grows storage without bound — same platform-wide availability
   blast radius as p8-001, just slower per request.
2. **Public badge poisoning**: `GET /api/badge/installs` computes
   `COUNT(DISTINCT install_id)` over `install_stats` (`worker.ts:90`) with a 60 s cache.
   Fake installs directly inflate the marketing badge number shown publicly.

## Evidence

- Schema: `site/workers/src/handlers/license.ts:754-761` —
  `install_id: Schema.String.pipe(Schema.minLength(1))`; version/platform/backend optional,
  uncapped.
- Sink: `license.ts:779-786` — `INSERT OR IGNORE INTO install_stats ... VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`.
- No guard stack: route dispatch `worker.ts` case `/api/install-ping` → handler directly;
  no limiter call in file.
- Badge consumer: `site/workers/src/worker.ts:87-121` (`COUNT(DISTINCT install_id)`,
  `Cache-Control: public, max-age=60`).
- Table shape: `migrations/0000_current_baseline.sql:452-459`.

## Attack Steps

1. Loop `POST /api/install-ping {"install_id":"<uuid>"}` from any connection; each unique id
   inserts one row. 10k requests ≈ 10k fake installs + quota consumption.
2. Observe `https://omg-api.latham.cloud/api/badge/installs` reporting inflated counts after
   ≤60 s cache expiry.

## Why This Passed SAST

Parameterized INSERT with no injection surface; the issue is an absent rate limit/length cap
on an intentionally public endpoint — invisible to structural rules.

## Recommended Fix

Cap field lengths via schema (`maxLength`), rate-limit per IP via `env.API_RATE_LIMITER`
(already bound in wrangler.toml namespace 1003), and consider excluding obvious abuse
(e.g., per-IP install dedup window) or computing the badge from a sanitized aggregate.

## PoC Metadata

PoC-Status: executed
PoC-Block-Reason:
Protocol: http
Auth-Required: no
Auth-Roles-Required: anonymous
