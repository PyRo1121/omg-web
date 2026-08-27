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
| `audit-w5.md`  | **Open**        | Dynamic security headers, safe JSON-LD serialization, bounded browser storage, and one shared header policy are complete. Removing CSP `script-src 'unsafe-inline'` still requires nonce rollout plus authenticated hydration/browser regression testing.                                                                                                                                                     |
| `audit-w6.md`  | Resolved        | Stripe/body bounds, pre-parse limiting, analytics caps, race-safe provisioning, OTP counters, sanitized errors, route metadata, router buffering/cache policy, and releases least privilege are fixed.                                                                                                                                                                                                        |
| `audit-w7.md`  | **Open**        | Scratch artifacts, broad Gitleaks exemptions, fixture scoping, test-secret configuration, and repository scanning are fixed. `site-svelte/.env` remains mode `600` and ignored, but replacing local plaintext deployment inputs with an external secret source and rotation procedure remains open.                                                                                                           |
| `audit-w8.md`  | Accepted        | Override rationale, unused dependencies, exact pins, and lifecycle trust were repaired. Alchemy's Prisma toolchain remains an upstream development dependency; workspace version differences are exact-pinned and reviewed rather than force-deduplicated.                                                                                                                                                    |
| `audit-w9.md`  | **Open**        | Router proxy/forwarding/cache flaws, bounded session rows, admin parameter consistency, licensing failure telemetry, releases metadata validation, login bounds, signup validation, and docs routing are fixed. The remaining item is the shared nonce-CSP work tracked under `audit-w5.md`.                                                                                                                  |
| `audit-w10.md` | Resolved        | Router credential isolation, `Set-Cookie` stripping, admin/telemetry/internal limiting, API headers, releases least privilege, forwarding-header cleanup, and release-download limiting are complete. The releases Worker remains intentionally undeployed.                                                                                                                                                   |
| `audit-w12.md` | **Open**        | SSR/API headers, duplicate origins, router policy, open-proxy prevention, stage-gated `workers.dev`, cookie attributes, forwarding/caching safety, CSP origin drift, and image-origin tightening are fixed. Nonce-based removal of `unsafe-inline` remains open.                                                                                                                                              |
| `audit-y1.md`  | Accepted        | SolidStart and SvelteKit intentionally coexist during phased cutover. Security policy and shared contracts are centralized where runtime drift is dangerous; framework-specific markup, legal rendering, and page composition remain duplicated until the old tree is deleted at cutover.                                                                                                                     |
| `audit-y2.md`  | Resolved        | Email syntax, licensing parse adaptation, session roles, customer tier/status literals, overview breakdown items, and D1 row types now have one appropriate source. The proposed all-fields provider-session superset was rejected because consumers intentionally project different minimum identity fields. Module-specific boundary aliases and timestamp limits remain semantic, not competing contracts. |
| `audit-y3.md`  | Resolved        | Shared security policy, email syntax, licensing parsing, and Solid class merging are centralized. Bounded Request/Response readers and schema decoders intentionally retain distinct output/error contracts; proposed generic D1, tagged-error, toggle, and formatting wrappers were rejected under the deletion test because they add coupling without removing behavioral duplication.                      |
| `audit-y4.md`  | Resolved        | The router and releases Worker are independently deployable, security-hardened surfaces. Dead bindings and per-request header allocation were removed. Cross-worker proxy/error abstractions were rejected because they would add a shared deployment dependency for little behavioral value.                                                                                                                 |
| `audit-y5.md`  | **Open**        | Runtime and production scratch artifacts are removed, but duplicated historical `piolium` PoC/evidence files remain. Cleanup must preserve one canonical, non-production proof per confirmed historical finding and keep exact-path Gitleaks coverage.                                                                                                                                                        |
| `audit-y6.md`  | **Coordinated** | Web route support, licensed feature grants, installer synchronization, production origin, JWT issuer/audience, and the published verification key are aligned. A generated cross-language telemetry/licensing contract and remaining machine/usage schema consolidation require coordinated Rust changes and are assigned to the Rust remediation stream.                                                     |

## Current open order

1. Remove CSP `unsafe-inline` with nonces after explicit authenticated Helium testing is authorized.
2. Replace local Alchemy deployment secrets with an external secret source and document rotation.
3. Reduce `piolium` evidence fan-out while preserving one canonical historical proof per finding.
4. Complete `audit-y6.md` with the Rust remediation stream.

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
