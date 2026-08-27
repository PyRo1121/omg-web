# OMG Web audit remediation status

This ledger tracks the 15 web and cross-repository reports in
`/home/pyro1121/Documents/.pi/omg-audit-2026-08-27/reports/`. Report severities
reflect the source tree at audit time; current status is based on the remediated
source, tests, deployed Cloudflare resources, and explicit architecture decisions.

Status meanings:

- **Resolved** — actionable findings are fixed and verified, or the remaining note
  was explicitly rejected as a non-beneficial abstraction.
- **Accepted** — no current vulnerability remains, but temporary migration
  duplication or dependency weight is intentionally retained.
- **Open** — bounded follow-up remains.
- **Coordinated** — closure requires a matching change in the Rust `omg` repository.

## Report ledger

| Report         | Status          | Current disposition                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-w2.md`  | Resolved        | OTP attempt accounting, analytics bounds, internal/admin limiting, negative metric rejection, duplicate public origins, router cookie handling, audit retention, authenticated route limiting, and one-way Worker session persistence are implemented. Invalid admin-route status distinctions are accepted low-risk behavior.                                                                                |
| `audit-w4.md`  | Resolved        | Lockfile metadata, lifecycle-script trust, workerd drift, override documentation, Playwright network fallback, source-policy checks, and CI coverage were repaired. Exact-tested prerelease framework versions remain intentional and pinned.                                                                                                                                                                 |
| `audit-w5.md`  | **Open**        | Dynamic headers, safe JSON-LD serialization, bounded browser storage, and shared policy are complete. Script `unsafe-inline` is removed: Solid prerenders use generated SHA-256 sources, dynamic Solid responses use request nonces, and SvelteKit uses auto nonce/hash CSP. Public live checks pass; authenticated Helium hydration and mutation regression remains the final gate.                          |
| `audit-w6.md`  | Resolved        | Stripe/body bounds, pre-parse limiting, analytics caps, race-safe provisioning, OTP counters, sanitized errors, route metadata, router buffering/cache policy, and releases least privilege are fixed.                                                                                                                                                                                                        |
| `audit-w7.md`  | Resolved        | Scratch artifacts, broad Gitleaks exemptions, fixture scoping, and test-secret configuration are fixed. The project-local Svelte `.env` was removed; Alchemy commands now require process-environment injection or desktop Secret Service keyring entries, never place values in argv, and use the installed CLI without network fallback. Rotation is documented.                                            |
| `audit-w8.md`  | Accepted        | Override rationale, unused dependencies, exact pins, and lifecycle trust were repaired. Alchemy's Prisma toolchain remains an upstream development dependency; workspace version differences are exact-pinned and reviewed rather than force-deduplicated.                                                                                                                                                    |
| `audit-w9.md`  | **Open**        | Router, bounded rows, parameter consistency, licensing telemetry, releases validation, login/signup bounds, and docs routing are fixed. Nonce/hash CSP is deployed and publicly characterized; only the authenticated Helium regression gate shared with `audit-w5.md` remains.                                                                                                                               |
| `audit-w10.md` | Resolved        | Router credential isolation, `Set-Cookie` stripping, admin/telemetry/internal limiting, API headers, releases least privilege, forwarding-header cleanup, and release-download limiting are complete. The releases Worker remains intentionally undeployed.                                                                                                                                                   |
| `audit-w12.md` | **Open**        | SSR/API headers, duplicate origins, router policy, proxy prevention, stage-gated `workers.dev`, cookie attributes, forwarding/cache safety, CSP drift, and image origins are fixed. Nonce/hash script CSP is deployed without `unsafe-inline`; authenticated Helium verification remains before closure.                                                                                                      |
| `audit-y1.md`  | Accepted        | SolidStart and SvelteKit intentionally coexist during phased cutover. Security policy and shared contracts are centralized where runtime drift is dangerous; framework-specific markup, legal rendering, and page composition remain duplicated until the old tree is deleted at cutover.                                                                                                                     |
| `audit-y2.md`  | Resolved        | Email syntax, licensing parse adaptation, session roles, customer tier/status literals, overview breakdown items, and D1 row types now have one appropriate source. The proposed all-fields provider-session superset was rejected because consumers intentionally project different minimum identity fields. Module-specific boundary aliases and timestamp limits remain semantic, not competing contracts. |
| `audit-y3.md`  | Resolved        | Shared security policy, email syntax, licensing parsing, and Solid class merging are centralized. Bounded Request/Response readers and schema decoders intentionally retain distinct output/error contracts; proposed generic D1, tagged-error, toggle, and formatting wrappers were rejected under the deletion test because they add coupling without removing behavioral duplication.                      |
| `audit-y4.md`  | Resolved        | The router and releases Worker are independently deployable, security-hardened surfaces. Dead bindings and per-request header allocation were removed. Cross-worker proxy/error abstractions were rejected because they would add a shared deployment dependency for little behavioral value.                                                                                                                 |
| `audit-y5.md`  | Resolved        | Runtime scratch is removed. Thirty byte-identical historical proof-script copies were replaced by 27 SHA-256 manifests that point to one canonical script per finding; captured logs remain unchanged. CI verifies hashes, path containment, removed-copy absence, and unique script content. Broad test-harness abstractions and upstream-owned lint-rule changes were rejected.                             |
| `audit-y6.md`  | **Coordinated** | Web route support, licensed feature grants, installer synchronization, production origin, JWT issuer/audience, and the published verification key are aligned. A generated cross-language telemetry/licensing contract and remaining machine/usage schema consolidation require coordinated Rust changes and are assigned to the Rust remediation stream.                                                     |

## Current open order

1. Complete authenticated Helium regression testing for the deployed nonce/hash CSP.
2. Complete `audit-y6.md` with the Rust remediation stream.

## Recently verified remediations

- Worker session bearer values are no longer stored in plaintext. Migration
  `023_session_token_hashes.sql` is applied; all existing rows were backfilled,
  and live mint/verification confirmed only versioned SHA-256 digests persist.
- All session-authenticated Worker routes are bounded before D1 work using native
  Cloudflare rate limiting and non-replayable token-digest keys.
- Svelte licensing degradation emits sanitized structured logs containing only a
  stable event name and typed failure tag.
- CSP images are restricted to same-origin, data URLs, and
  `avatars.githubusercontent.com`; production and shadow headers were verified.
- Alchemy memoization includes `../site/shared/**`, preventing stale Svelte builds
  when shared contracts or security policy change.
- The undeployed releases Worker now has fail-closed native download limiting;
  default and production Wrangler dry-runs pass.
- Svelte licensing/admin boundaries share email syntax, parse adaptation,
  roles, customer tier/status literals, and schema-derived D1 row types without
  introducing a generic session superset.
- Historical PoC script copies are replaced by hash manifests and guarded by
  `npm run check:audit-evidence`.
- Alchemy deployment inputs come from CI environment injection or the desktop
  Secret Service keyring; the project-local plaintext `.env` was removed.
- Script `unsafe-inline` is removed. Production prerenders use exact SHA-256
  sources, dynamic Solid uses request nonces, and SvelteKit uses auto nonce/hash
  CSP; public live script coverage checks pass.
