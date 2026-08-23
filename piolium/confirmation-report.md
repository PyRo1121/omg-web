# Confirmation Report

| Field | Value |
|-------|-------|
| Audit ID | 2026-08-23T05:17:44.568Z |
| Repository | PyRo1121/omg-web (branch `main`, commit `6eb3c8e`) |
| Confirmed at | 2026-08-23T09:35:00Z |
| Environment | wrangler-dev-saas-worker (`site/workers/wrangler.toml`) — primary `http://localhost:8799`, secondary SSR worker `http://127.0.0.1:8807` |
| Original audit mode | deep |
| Confirmed-findings staging | `piolium/confirm-workspace/confirmed-findings/confirmed-live/` (all 14 findings) |

## Summary

| Status | Count | Findings |
|--------|-------|----------|
| confirmed-live | 14 | p10-001, p10-002, p10-003, p10-005, p10-006, p10-007, p10-008, p10-009, p10-010, p10-011, p10-012, p10-013, p10-014, p10-015 |
| confirmed-test | 0 | — |
| confirmed-fp | 0 | — |
| analytical-only | 0 | — |
| unconfirmed | 0 | — |
| inconclusive | 0 | — |
| blocked | 0 | — |
| no-poc | 0 | — |
| error | 0 | — |

**Confirmation rate**: 14/14 findings confirmed (100%) — `confirmed-fp` and `analytical-only` are excluded from the denominator.

## Per-Finding Status Table

One line per finding, with status, evidence pointer, and reproduction command summary:

| Finding | Severity | Class | Status | Evidence | Reproduction summary |
|---------|----------|-------|--------|----------|----------------------|
| p10-001 turnstile-fail-open-unset-secret | medium | Insecure default / fail-open access control (CWE-1188) | confirmed-live | `piolium/findings/p10-001-turnstile-fail-open-unset-secret/evidence/confirmed-20260823T090849Z.log` | `bash poc.sh` — runs `poc.test.ts` via `@cloudflare/vitest` workerd pool against real Worker + local D1 with `TURNSTILE_SECRET_KEY` unset; bot gate silently skipped |
| p10-002 auth-surface-no-ip-rate-limiting | high | Missing rate limiting / brute-force protection | confirmed-live | `piolium/findings/p10-002-auth-surface-no-ip-rate-limiting/evidence/confirmed-20260823T090852Z.log` | `bash poc.sh $BASE_URL` — HTTP burst from one IP; 15 OTP emails relayed in <60s with zero 429s despite documented AUTH_RATE_LIMITER 10/min/IP |
| p10-003 otp-send-quota-toctou | medium | TOCTOU race in quota enforcement | confirmed-live | `piolium/findings/p10-003-otp-send-quota-toctou/evidence/confirmed-20260823T090853Z.log` | `bash poc.sh [repo-root]` — concurrent `/api/auth/send-code` burst in workerd pool defeats check-then-insert 3-per-10-min cap |
| p10-005 otp-attempt-burnout-login-dos | medium | Auth bypass of brute-force protection / lockout DoS | confirmed-live | `piolium/findings/p10-005-otp-attempt-burnout-login-dos/evidence/confirmed-20260823T090853Z.log` | `bash poc.sh [repo-root]` — unauthenticated verify-code failure burn against victim email in workerd pool; account locked out |
| p10-006 internal-site-session-public-shared-secret-admin-minting | medium | Broken access control / exposed internal endpoint (CWE-284/306) | confirmed-live | `piolium/findings/p10-006-internal-site-session-public-shared-secret-admin-minting/evidence/confirmed-20260823T090853Z.log` | `POST /api/internal/site-session` with static `X-Admin-Secret` + `role:"admin"` body → minted bearer token returns HTTP 200 on `/api/admin/dashboard`; variant executed on dedicated :8809 instance with ADMIN_API_SECRET configured |
| p10-007 better-auth-secret-dev-fallback | medium | Fail-open fallback to hard-coded credential | confirmed-live | `piolium/findings/p10-007-better-auth-secret-dev-fallback/evidence/confirmed-20260823T090856Z.log` | `exploit.sh` vs secondary SSR worker :8807 — cookie signed offline with public constant `dev-secret-change-me` + leaked raw token renders victim account as authenticated on `/dashboard`; no-cookie/wrong-key controls fail closed |
| p10-008 stripe-customer-created-email-autolink | medium | Cross-account linkage via attacker-influenced webhook payload | confirmed-live | `piolium/findings/p10-008-stripe-customer-created-email-autolink/evidence/confirmed-20260823T090856Z.log` | `bash exploit.sh $BASE_URL` — python3-signed `customer.created` event POSTed to `/api/stripe/webhook` auto-links local account by bare email match |
| p10-009 get-license-anonymous-email-enumeration | medium | Information disclosure / enumeration oracle | confirmed-live | `piolium/findings/p10-009-get-license-anonymous-email-enumeration/evidence/confirmed-20260823T090856Z.log` | Unauthenticated `GET /api/get-license?email=<victim>` → `found:true` with tier/status/expires_at/machine counts + masked license prefix; unknown email → `found:false` |
| p10-010 license-seat-limit-toctou-race | medium | Business logic / concurrency TOCTOU | confirmed-live | `piolium/findings/p10-010-license-seat-limit-toctou-race/evidence/confirmed-20260823T090857Z.log` | `bash poc.sh [repo-root]` — concurrent validate-license activations in workerd pool observed 40 machines vs cap 2 |
| p10-011 customer-find-or-create-duplicate-race | medium | Race condition / duplicate identity rows (CWE-362/367) | confirmed-live | `piolium/findings/p10-011-customer-find-or-create-duplicate-race/evidence/confirmed-20260823T091826Z-v3.log` (+ `impact.log`) | `./exploit.sh [repo-root]` — two concurrent POST /api/auth/verify-code for one identity both returned 200 and created duplicate customer rows; final log records `P10_011_RESULT reproduced` |
| p10-012 revoked-machine-resurrection | high | Broken authorization / state-machine bypass (CWE-285/862) | confirmed-live | `piolium/findings/p10-012-revoked-machine-resurrection/evidence/confirmed-20260823T091747Z-v2.log` | `bash poc.sh [repo-root]` — deactivate then revalidate; revoked machine received fresh signed 7-day JWT and freed its seat to a second machine on max_machines=1; 3/3 tests passed, verdict `{"status":"confirmed"}` |
| p10-013 stripe-projection-stale-write | medium | Race condition / lost update in billing projection | confirmed-live | `piolium/findings/p10-013-stripe-projection-stale-write/evidence/confirmed-20260823T090857Z.log` | `bash poc.sh` — interleaved concurrent subscription webhooks through real handleStripeWebhook in workerd; stale snapshot commits last over newer cancellation |
| p10-014 analytics-ingest-missing-caps-d1-write-flood | high | Uncontrolled resource consumption / DoS | confirmed-live | `piolium/findings/p10-014-analytics-ingest-missing-caps-d1-write-flood/evidence/confirmed-20260823T090857Z.log` | Oversized batch POST to `/api/analytics`: 120 events accepted (sibling cap is 50), ~600 D1 statements fanned out; ~2 MiB payload accepted past 1 MiB sibling gate |
| p10-015 install-ping-unthrottled-row-inflation | medium | Uncontrolled resource consumption / data integrity | confirmed-live | `piolium/findings/p10-015-install-ping-unthrottled-row-inflation/evidence/confirmed-20260823T090858Z.log` | Repeated anonymous `POST /api/install-ping` with unique install_ids then `GET /api/badge` — observed `ok=25 before=53 after=78 delta=25` |

### Notes on two wrapper-clipped variants (due diligence)

Both were re-verified from full evidence logs rather than re-run blindly:

- **p10-011**: V4 wrapper hit its 30s cap after tests completed; authoritative markers captured from the same run's `impact.log` (concurrent verify-code double-submit: `statusA=statusB=200`, duplicate customer IDs recorded) plus final variant log `P10_011_RESULT reproduced`.
- **p10-012**: adapted variant copy ran to completion (`confirmed-20260823T091747Z-v2.log`) — only a cosmetic healthcheck vitest pre-run was stripped; exploit logic untouched; structured JSON verdict present.

## Breakdown by Exploitability Class

| Class | Total | confirmed-live | confirmed-test | unconfirmed | blocked | analytical-only |
|-------|-------|----------------|----------------|-------------|---------|-----------------|
| network-exploitable | 14 | 14 | 0 | 0 | 0 | 0 |
| local-exploitable | 0 | — | — | — | — | — |
| non-exploitable | 0 | — | — | — | — | 0 |

## Breakdown by PoC Origin

| PoC Origin | Total | confirmed-live | confirmed-test | unconfirmed | blocked | analytical-only |
|------------|-------|----------------|----------------|-------------|---------|-----------------|
| runnable (PoC-backed) | 14 | 14 | 0 | 0 | 0 | 0 |
| theoretical | 0 | — | 0 | 0 | 0 | 0 |
| none | 0 | — | 0 | 0 | 0 | 0 |

No theoretical or no-PoC findings existed, so no generated reproducer test was required; the V5 fallback pass verified all 14 findings were already live-confirmed by V4 (`skipped-v5-already-confirmed-live` × 14).

## Confirmed Findings (Live)

All 14 findings are detailed in the per-finding table above. Each finding directory under
`piolium/findings/<ID>-<slug>/` is self-contained: `report.md` (full disclosure draft),
`poc.sh`/`poc.test.ts`/`exploit.sh` (reproduction scripts), `setup.sh` (environment prep),
and `evidence/` (structured confirm logs, exploit logs, impact logs, env-info).

Staged copies for reviewer convenience: `piolium/confirm-workspace/confirmed-findings/confirmed-live/<ID>-<slug>/`.

Severity distribution of confirmed findings: **3 HIGH** (p10-002 missing IP rate limiting, p10-012 revoked-machine resurrection, p10-014 analytics D1 write flood), **11 MEDIUM** (remainder).

## False Positives

**None.** Zero finding directories were renamed with the `FP-` prefix during this confirmation run.
`piolium/confirm-workspace/false-positive-renames.json` records `"renames": []` (checked 2026-08-23T09:24:58Z).
Every one of the 14 findings reproduced under live execution; nothing was disproved.

For completeness, the adversarial-review chamber (P10) rejected 4 earlier drafts as false positives before findings numbering — those never entered `piolium/findings/` and are not part of this confirmation scope.

## Blocked Findings

None. The application was reachable throughout (healthcheck passed); all three seeded identities had working tokens.

## Documented-Intent Matches

Omitted — `intent-verdicts.json` does not exist (V1.5 Intent Cross-Check was skipped for this run).

## Environment Details

- **Session UUID**: `p16:v3-2026-08-23T05-17-44-568Z-a1-8cad2ca9`
- **Provisioning method**: `wrangler-dev-saas-worker` (strategy 1) — target already live from P16 V1/V2 evidence runs (PIDs 212565/212582/212589/212648); verified health + identity seeding instead of restarting; migrations pre-applied to site/workers D1 state
- **Primary base_url**: `http://localhost:8799` (omg-saas API worker)
- **Secondary base_url**: `http://127.0.0.1:8807` (omg-site SSR worker, used by p10-007; persist-to `/tmp/p10-007-state`)
- **p10-006 dedicated instance**: separate wrangler dev on `:8809` with `ADMIN_API_SECRET` set (deployment posture the finding describes; shared :8799 instance fails closed without it)
- **Actual port after fallback**: 8799 (no fallback needed)
- **Startup duration**: ~0s reuse (pre-existing instance); initial wrong-DB detour (stale `site/.wrangler` state) noted in setup.log
- **Healthcheck**: `POST /api/auth/verify-session` → live 400 response pre-check passed; full healthcheck log confirms send-code/verify-code session minting for all 3 identities, admin gate 200/403 split working (`piolium/confirm-workspace/healthcheck.log`)
- **Worker env overrides**: `JWT_SECRET=poc-test-secret-...` , `STRIPE_WEBHOOK_SECRET=poc-whsec-...` , `TURNSTILE_SECRET_KEY` unset (shipped default posture, subject of p10-001)

### Auth Context

| Label | Email | Role | Token Available | Used By |
|-------|-------|------|-----------------|---------|
| admin | piolium-admin@audit.local | admin | yes | admin-gate controls across findings |
| user | piolium-user@audit.local | user | yes | auth-gate negative controls |
| guest | piolium-guest@audit.local | none (customers.admin=0, tier=free) | yes | enumeration/DoS findings |

All three identities authenticated via OTP with known-digest `auth_codes` rows injected into local D1 (no passwords in this auth model). Tokens carried as `Authorization: Bearer [REDACTED:bearer]

### Cleanup Result

✅ **Complete.** After report compilation, both dev workers were terminated using the documented cleanup command plus direct kill for the surviving SSR process tree:

```
pkill -f 'wrangler dev --port 8799'
pkill -f 'wrangler dev --config wrangler.toml --port 8807'   # missed npm wrapper; killed directly (PIDs 245627/245644/245653)
```

Verified post-cleanup: zero `wrangler`/`esbuild` processes remain; `http://localhost:8799` and `http://127.0.0.1:8807` both connection-refused. DB state preserved at `piolium/confirm-workspace/db-snapshot.sqlite`; note that leftover PoC rows (attacker-poc-*@evil.test with admin=1, etc.) remain in the live `.wrangler` D1 file — restore from snapshot if pristine state is ever needed.

## Methodology

1. **V1 Inventory**: every finding directory enumerated from `piolium/findings/`; source-of-truth policy = `report.md` preferred (all 14 present and >7KB, no repair fallbacks needed); inventory written to `findings-inventory.json`. All 14 classified `poc_kind=runnable`, `network-exploitable`, routed to V4 with no V5 fallback.
2. **V3 Environment**: wrangler-dev provisioning strategy reused the live worker on :8799 (+ SSR worker :8807); healthcheck passed; three OTP-based test identities seeded; sqlite DB snapshotted.
3. **V4 Live PoC Execution**: each finding's original `poc.sh`/`exploit.sh` executed against the real Workers (workerd/vitest pool with production D1 migrations for race-condition findings; live HTTP for endpoint findings). Structured confirm logs written per finding to `<finding>/evidence/confirmed-*.log`. Two wrapper-clipped variants (p10-011, p10-012) resolved via their complete evidence logs rather than counted as failures.
4. **V5 Generated-Test Fallback**: scoped to non-V4-confirmed/theoretical/no-PoC findings — candidate count was 0 (all 14 already confirmed-live); due diligence performed anyway on the two clipped variants.
5. **V6 Report Compilation**: single-category resolution per finding (priority: confirmed-live > confirmed-test > confirmed-fp > …), staging of reached-verdict findings, FP rename scan, this report, and audit-state update.

**Limitations**: All results are from a local `wrangler dev` (workerd/miniflare) approximation of production Cloudflare bindings. Race-condition findings rely on workerd's concurrency semantics; timing-dependent outcomes may vary slightly on real production infrastructure, though the underlying check-then-insert patterns are structural and would remain exploitable. Rate-limit findings reflect the shipped-default configuration (bindings declared but never invoked).
