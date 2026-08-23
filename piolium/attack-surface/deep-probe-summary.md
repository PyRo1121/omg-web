# Deep Probe Summary — Stage 08 (P8, Manual Attack Surface Probe)

Status: complete
Mode: single-team MVP (backward + contradiction reasoning performed inline; verification by read/grep with file:line evidence)
Commit probed: `6eb3c8e` (main)
Inputs consumed: `knowledge-base-report.md`, `candidates-summary.md`, `unauthenticated-surface.md`,
`public-routes-authz-matrix.md` (via unauth surface), `source-sink-flows-all-severities.md`,
`state-concurrency-summary.md`, `spec-gap-summary.md`, existing drafts p4-001…p7-004 (deduped).

Inventory artifact: `piolium/attack-surface/manual-attack-surface-inventory.md`

## Scope selection rationale

Highest-impact slices not already covered by P4–P7 drafts: (a) the anonymous telemetry-ingest
economics slice (`/api/analytics`, `/api/install-ping`) where the KB asserted caps that turned
out to exist only on sibling routes; (b) the OTP verify lifecycle under the shipped
"no-limiter, Turnstile-off" configuration. Cleared as sound during this pass: CSV export
formula-injection handling, stored-XSS render chain (no `innerHTML`/`@html` in `site/src/**`),
github-proxy cache/CORS derivation, firehose parameter clamping, OTP generator entropy.

## Hypotheses generated and dispositioned

| ID | Hypothesis (backward / contradiction origin) | Verdict | Artifact |
|----|----------------------------------------------|---------|----------|
| H1 | *Contradiction*: KB claims "batch caps enforced server-side (500 events/1MB)" — refuted for `/api/analytics`; missing every control its sibling ingest routes have → D1 write-flood on shared Free-plan DB | VALID (HIGH) | `findings-draft/p8-001-analytics-ingest-missing-caps-d1-write-flood.md` |
| H2 | *Backward*: same missing-control pattern at `/api/install-ping` — attacker-keyed INSERT OR IGNORE, no limiter → quota drain + public badge poisoning | VALID (MEDIUM) | `findings-draft/p8-002-install-ping-unthrottled-row-inflation.md` |
| H3 | *Backward*: per-code attempt cap + single-active-code policy + failure-path counter + no IP throttle/Turnstile = trivial login lockout for any email | VALID (MEDIUM) | `findings-draft/p8-003-otp-attempt-burnout-login-dos.md` |
| H4 | CSV formula injection in admin exports via telemetry-tainted cells | INVALIDATED — `escapeCSV` neutralizes `=+-@` prefixes and quotes (`admin.ts:374-388`) | n/a (cleared) |
| H5 | Stored XSS chain telemetry `properties` → admin dashboard render | INVALIDATED (re-affirmed) — zero `innerHTML`/`@html` in `site/src/**` (grep) | n/a (cleared) |
| H6 | github-proxy cache stores attacker CORS headers / key flooding escalation | INVALIDATED — ACAO re-derived per request from live Origin against strict allowlist; flooding previously triaged Low (P4) | n/a (cleared) |
| H7 | Firehose `since`/`limit` injection or unbounded query | INVALIDATED — parameterized; limit clamped [1,100] incl. SQLite negative-LIMIT quirk (`firehose.ts:41-47`) | n/a (cleared) |
| H8 | OTP pre-account hijack via auto-create on verify | NOT EXPLOITABLE as drafted — code delivery is to victim mailbox only; binding requires code knowledge ≡ ownership (residual risk tracked in KB scenario 2 for Phase 10 if email transport ever fails open) | n/a |

Total hypotheses: 8 · Validated/drafted: 3 · Invalidated/cleared: 4 · Not exploitable: 1

## Validated findings (severity-ranked)

1. **p8-001 (HIGH)** — `/api/analytics`: no Content-Length cap, no batch cap, no rate limiter,
   no string truncation; anonymous events pass when `license_key` absent; each command event →
   5 D1 statements; unbounded distinct upsert keys. Unauthenticated quota-exhaustion DoS on the
   D1 database shared by auth + licensing workers. Evidence: `license.ts:885-976`,
   `contracts/license-ops.ts:55-72`, `body.ts:26-40`, contrast `telemetry.ts:15`,
   `docs-analytics.ts:63`, `site-analytics.ts:162`.
2. **p8-002 (MEDIUM)** — `/api/install-ping`: attacker-keyed unthrottled row inflation in
   `install_stats` + public badge count poisoning (`worker.ts:87-121`). Evidence:
   `license.ts:754-792`, migration baseline :452.
3. **p8-003 (MEDIUM)** — OTP attempt-burnout: 5 junk codes invalidate the victim's only active
   code; no functioning IP limiter (`AUTH_RATE_LIMITER` never wired), Turnstile default-off ⇒
   repeatable sign-in lockout for any email. Evidence: `auth.ts:337-386`, `wrangler.toml:26-29`.

## Chain potential (for Phase 10)

- p8-001 + p6-003 (OTP send-quota TOCTOU): both drain/write the same shared D1; combined they
  can suppress *new* session writes platform-wide (auth outage) while staying fully anonymous.
- p8-003 + p4-001/p5-002: burnout is weaponizable precisely because the two prior gaps leave
  the verify endpoint unthrottled and captcha-free; fixing either raises burnout cost ~10×/min/IP.
- p8-002 badge poisoning is a low-grade integrity lever on a public marketing signal (brand/reputation).

## Coverage summary

| Entry-point slice | backward reasoning | contradiction reasoning | verdict |
|---|---|---|---|
| `/api/analytics` ingest | H1 | H1 (KB-cap claim refuted) | p8-001 HIGH |
| `/api/install-ping` | H2 | — | p8-002 MEDIUM |
| OTP send/verify lifecycle | H3, H8 | H3 (protective-control inversion) | p8-003 MEDIUM; H8 dropped |
| Admin CSV exports | H4 | — | cleared |
| Telemetry→admin render chain | H5 | H5 (KB claim re-verified) | cleared |
| github-proxy cache/CORS | H6 | — | cleared |
| Firehose params | H7 | — | cleared |
| Stripe webhook, BFF/site-session, admin plane | — | — | covered by p4-002/p4-005/p5-001…004 (not re-probed) |

Stop reason: all selected high-impact slices dispositioned; remaining surface already covered by
P4–P7 drafts; no new Fragile or uncovered entry points introduced by this pass.

## Handoff notes

- Phase 10 chambers should live-test p8-001 first (single request, measurable row-count delta);
  it also retroactively corrects the P3/P4 KB statement about server-side batch caps.
- Consider folding p8-002's fix into the same PR as p8-001 (identical remediation pattern:
  schema maxLength + `API_RATE_LIMITER` wiring in `handlers/license.ts`).
