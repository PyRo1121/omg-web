# State & Concurrency Audit — Stage 06 (P6, deep mode)

> Auditor: state & concurrency phase over commit `6eb3c8e` (main).
> Scope: temporal ordering, shared mutable state, TOCTOU, atomicity of monetized
> resources, idempotency. Complements p4 drafts (kept, not re-filed).

## State-Holding Entities Catalogued (7)

| Entity | State / counter columns | Writers |
|---|---|---|
| `auth_codes` | `used`, `attempt_count` (OTP lifecycle) | `handlers/auth.ts` (send/verify) |
| `customers` | `admin` (0/1 privilege flag), `tier`, `stripe_customer_id` | auth.ts, site-session.ts, billing.ts, admin.ts, stripe-reconciliation.ts |
| `licenses` | `status` ('active'/'cancelled'), `tier`, `max_seats`, `max_machines`, `expires_at`; `used_seats` is **dead state — never written** | license validation (read), stripe-reconciliation (write), admin.ts:769-775, dashboard key regen |
| `machines` | `is_active` (1/0), `revoked_at` (**never written** — dead column) | dashboard revoke ×3, license.ts activation/touch |
| `sessions` | expiry-bounded rows, keep-latest-5 prune | auth.ts verify, site-session mint, dashboard revoke/logout |
| `stripe_events` | `status CHECK IN ('received','processing','processed','failed')`, `attempt_count`, `processing_started_at` | billing.ts claim/mark handlers |
| `analytics_daily` / `usage_*` | `value = value + ?`, `MAX()` upserts | telemetry/report-usage |

## Concurrency Primitives Observed

- **No application-level locks** anywhere (no Mutex/locks API/Redis/advisory locks).
- **No explicit transactions**; the only multi-statement atomic units are D1 `db.batch`
  calls (auth code replace, analytics ingest, stripe projection) — batch is atomic but
  not a read-modify-write guard.
- Atomic single-statement conditional writes used correctly in exactly two places:
  OTP claim (`UPDATE ... WHERE id = (subquery) ... RETURNING`, auth.ts:343-360) and
  Stripe inbox claim (`UPDATE ... WHERE status IN (...) ` + `meta.changes` check,
  billing.ts:claimStripeEvent). Both are well-built.
- Everything else is check-then-act across separate D1 round-trips.

## Idempotency Infrastructure

- **Present**: Stripe webhook inbox (`INSERT OR IGNORE` + lease-style conditional
  UPDATE with 5-min stale reclaim + 409 Retry-After). Good design.
- **Absent**: OTP send-code quota (count-only, see p6-003); customer find-or-create
  (see p6-001); machine seat accounting (p4-004); no idempotency keys on any
  client-facing POST.

## Drafts Filed (4 new + 1 corroboration)

| ID | Class | Severity | One-line |
|---|---|---|---|
| p6-001 | double-submit / rmw-no-txn | HIGH | Find-or-create customer races at 3 call sites; no UNIQUE on `customers.email` → duplicate identity rows fragmenting sessions/licenses/admin-flag/stripe-link |
| p6-002 | state-machine-violation | HIGH | Revoked machine (`is_active=0`) passes validate-license existing-row path → keeps minting valid 7-day JWTs; revocation is cosmetic; `revoked_at` never written |
| p6-003 | toctou | MEDIUM | OTP send-code 3/10min quota is count-then-insert; concurrent burst bypasses cap → email bombing amplification (compounds p4-001 turnstile fail-open) |
| p6-004 | stale-read | MEDIUM | Cross-event webhook concurrency: fetch-snapshot-then-project has no ordering guard; stale subscription snapshot can be committed last, silently diverging entitlements from Stripe (also clobbers admin manual tier overrides) |
| *(corroboration)* p4-004 | toctou | confirmed HIGH-equivalent | Seat-limit count-then-insert re-traced at license.ts:255/288/310 — evidence strengthened: `UNIQUE(license_id,machine_id)` blocks same-id dupes only; distinct machine_ids all pass the count gate. Not re-filed. |

## Minor observations (below draft threshold)

- `verifyCode` keep-latest-5 session prune uses second-granularity `created_at`;
  two concurrent logins can evict each other's fresh session when ≥5 exist
  (availability nuisance only).
- `mintSiteSession` findActiveSession→insertSession race mints duplicate worker
  sessions (both valid tokens for one customer; harmless given token ≡ ownership).
- `registerOrTouchMachine` existing-row path also means seat *freeing* via revoke
  plus re-registration can exceed seats transiently — subsumed by p4-004/p6-002.
- Telemetry counters use `ON CONFLICT ... DO UPDATE SET value = value + ?` /
  `MAX(...)` — correctly atomic per statement; no lost-update exposure there.
  `report-usage` metric inflation was already triaged Low in P4 (design-inherent).

## Notes for Phase 10 chambers

All four p6 drafts are concurrency-class hypotheses invisible to SAST; the chamber's
Code Tracer should prioritize p6-001 (needs only two racing HTTP requests, no
special tooling) and p6-002 (single sequential request — trivially reproducible).
