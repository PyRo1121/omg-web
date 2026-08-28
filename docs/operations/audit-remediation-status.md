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
| `audit-w4.md`  | Resolved        | Lockfile metadata, version-qualified lifecycle trust, override documentation, Playwright network fallback, source-policy checks, and CI coverage were repaired. Svelte's older workerd is the exact installed Alchemy transitive rather than a stale trust entry; exact-tested prerelease framework versions remain intentional and pinned.                                                                   |
| `audit-w5.md`  | Resolved        | Dynamic headers, safe JSON-LD serialization, bounded browser storage, and shared policy are complete. Script `unsafe-inline` is removed: Solid prerenders use generated SHA-256 sources, dynamic Solid responses use request nonces, and SvelteKit uses auto nonce/hash CSP. Live coverage checks passed and the user confirmed authenticated Helium pages load correctly.                                    |
| `audit-w6.md`  | Resolved        | Stripe/body bounds, pre-parse limiting, analytics caps, race-safe provisioning, OTP counters, sanitized errors, route metadata, router buffering/cache policy, and releases least privilege are fixed.                                                                                                                                                                                                        |
| `audit-w7.md`  | Resolved        | Scratch artifacts, broad Gitleaks exemptions, fixture scoping, and production secret-source guards are fixed. The test config retains only Cloudflare's documented public always-pass Turnstile key. The project-local Svelte `.env` was removed; Alchemy now requires process environment or Secret Service injection, never argv values. Rotation is documented.                                            |
| `audit-w8.md`  | Accepted        | Override rationale, unused dependencies, exact pins, and lifecycle trust were repaired. Alchemy's Prisma toolchain remains an upstream development dependency; workspace version differences are exact-pinned and reviewed rather than force-deduplicated.                                                                                                                                                    |
| `audit-w9.md`  | Resolved        | Router, bounded rows, parameter consistency, licensing telemetry, releases validation, login/signup bounds, and docs routing are fixed. Nonce/hash CSP is deployed, publicly characterized, and authenticated Helium loading was user-verified.                                                                                                                                                               |
| `audit-w10.md` | Resolved        | Router credential isolation, `Set-Cookie` stripping, admin/telemetry/internal limiting, API headers, releases least privilege, forwarding-header cleanup, and release-download limiting are complete. The releases Worker remains intentionally undeployed.                                                                                                                                                   |
| `audit-w12.md` | Resolved        | SSR/API headers, duplicate origins, router policy, proxy prevention, stage-gated `workers.dev`, cookie attributes, forwarding/cache safety, CSP drift, and image origins are fixed. Nonce/hash script CSP is deployed without `unsafe-inline`; authenticated Helium loading was user-verified.                                                                                                                |
| `audit-y1.md`  | Accepted        | SolidStart and SvelteKit intentionally coexist during phased cutover. Security policy and shared contracts are centralized where runtime drift is dangerous; framework-specific markup, legal rendering, and page composition remain duplicated until the old tree is deleted at cutover.                                                                                                                     |
| `audit-y2.md`  | Resolved        | Email syntax, licensing parse adaptation, session roles, customer tier/status literals, overview breakdown items, and D1 row types now have one appropriate source. The proposed all-fields provider-session superset was rejected because consumers intentionally project different minimum identity fields. Module-specific boundary aliases and timestamp limits remain semantic, not competing contracts. |
| `audit-y3.md`  | Resolved        | Shared security policy, email syntax, licensing parsing, and Solid class merging are centralized. Bounded Request/Response readers and schema decoders intentionally retain distinct output/error contracts; proposed generic D1, tagged-error, toggle, and formatting wrappers were rejected under the deletion test because they add coupling without removing behavioral duplication.                      |
| `audit-y4.md`  | Resolved        | The router and releases Worker are independently deployable, security-hardened surfaces. Dead bindings and per-request header allocation were removed. Cross-worker proxy/error abstractions were rejected because they would add a shared deployment dependency for little behavioral value.                                                                                                                 |
| `audit-y5.md`  | Resolved        | Runtime scratch is removed. Thirty byte-identical historical proof-script copies were replaced by 27 SHA-256 manifests that point to one canonical script per finding; captured logs remain unchanged. CI verifies hashes, path containment, removed-copy absence, and unique script content. Broad test-harness abstractions and upstream-owned lint-rule changes were rejected.                             |
| `audit-y6.md`  | **Coordinated** | Web route support, licensed feature grants, installer synchronization, production origin, JWT issuer/audience, and the published verification key are aligned. A generated cross-language telemetry/licensing contract and remaining machine/usage schema consolidation require coordinated Rust changes and are assigned to the Rust remediation stream.                                                     |

## Finding closure matrix

This matrix covers every ranked finding in the 15 web/cross-repository reports.
Non-ranked evidence inventories, positive controls, and residual-risk prose inherit
the disposition of the finding they support. Slop-cluster recommendations that
were not ranked as findings are covered separately after the matrix.

Evidence keys:

- **SEC** — security remediation commits `2d2ad7d`, `42929ee`, `525ed73`,
  `e441ece`, and `46eff79`; focused Worker/Solid/Svelte tests; successful CI run
  `33124596139`; production/shadow header and session characterization.
- **SUP** — lockfile/source-policy/dependency checks introduced by `2d2ad7d`,
  dependency remediation `082b4d6`, exact-pin policy `ec618b7`, six clean npm
  audits, and passing CI.
- **BND** — boundary and data-integrity work in `984c482`, `af17cd0`,
  `c1c18bc`, `ee860dc`, `17b1344`, `e2f9a5c`, `eda6d32`, `df7a5d2`,
  `c7867e7`, and `821ec28`; focused contract/migration tests and live D1 checks.
- **DED** — evidence deduplication `ce12a3d`, audit-evidence CI verification,
  and deletion-test adjudication recorded in `91d13dc` and this ledger.
- **LIVE** — deployed production and shadow characterization, no-op Alchemy
  plan, and user-confirmed authenticated Helium page loading after nonce rollout.
- **RUST** — coordinated work assigned to the independent Rust remediation
  stream; web-side changes remain backward-compatible while that stream closes.

### Web security, supply-chain, and boundary reports

| ID       | Finding                                                       | Disposition | Evidence                                                                                                                                                                   |
| -------- | ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2-F2-1  | OTP attempt guard never incremented                           | Fixed       | SEC/BND; atomic attempt accounting and OTP tests.                                                                                                                          |
| W2-F2-2  | Unbounded analytics-error primary-key strings                 | Fixed       | SEC/BND; bounded normalized properties and error rows.                                                                                                                     |
| W2-F2-3  | Plaintext D1 session tokens                                   | Fixed       | SEC; migration `023_session_token_hashes.sql`, digest-only live backfill.                                                                                                  |
| W2-F3-1  | Unlimited internal-secret guessing                            | Fixed       | SEC; fail-closed native internal/admin limiters.                                                                                                                           |
| W2-F3-2  | Unthrottled authenticated endpoints                           | Fixed       | SEC; every session route is pre-D1 limited by token digest.                                                                                                                |
| W2-F3-3  | Negative CLI telemetry metrics                                | Fixed       | BND; schemas reject negative counters/durations.                                                                                                                           |
| W2-F3-4  | Duplicate `omg-saas.workers.dev` origin                       | Fixed       | SEC/LIVE; production `workers_dev = false`, duplicate returns 404.                                                                                                         |
| W2-F3-5  | Router forwards cookies and caches `Set-Cookie`               | Fixed       | SEC; credential stripping and private/cache-safe forwarding tests.                                                                                                         |
| W2-F3-6  | Client-controlled offer IP limit key                          | Fixed       | SEC; trusted edge-derived address only, missing IP fails closed.                                                                                                           |
| W2-F3-7  | Audit cleanup never scheduled                                 | Fixed       | SEC/BND; retention executes through scheduled maintenance path.                                                                                                            |
| W2-F3-8  | Admin 401/403 existence distinction                           | Accepted    | Low-risk HTTP semantics retained; authorization still fails closed and leaks no private body.                                                                              |
| W4-F1    | Lockfile entries lacked registry integrity metadata           | Fixed       | SUP; lockfile integrity checker and repaired npm lockfiles.                                                                                                                |
| W4-F2    | Blanket unversioned esbuild lifecycle trust                   | Fixed       | SUP; exact package/version allow-script policy.                                                                                                                            |
| W4-F3    | Stale divergent `workerd` trust pin                           | Accepted    | Svelte's `1.20260704.1` entry exactly matches Alchemy beta.74's installed transitive; other workspaces independently trust their installed `1.20260820.1`.                 |
| W4-F4    | Undocumented security overrides and package alias             | Fixed       | SUP; `docs/operations/dependency-pins.md` plus CI checks.                                                                                                                  |
| W4-F5    | Accidental `fsevents` install-script posture                  | Fixed       | SUP; explicit deny/allow policy.                                                                                                                                           |
| W4-F6    | `npx playwright` network fallback in CI                       | Fixed       | SUP; installed npm executable only.                                                                                                                                        |
| W4-F7    | Production prerelease framework dependency                    | Accepted    | Exact-pinned, source-reviewed migration dependency with package-scoped peer override and full tests.                                                                       |
| W4-F8    | Root checks lacked type coverage and cloned into `/tmp`       | Fixed       | SUP; root CI covers workspaces and source-policy sync avoids RAM-backed scratch clones.                                                                                    |
| W5-F1    | Solid dynamic HTML lacked security headers                    | Fixed       | SEC/LIVE; middleware covers SSR/API responses.                                                                                                                             |
| W5-F2    | Script CSP allowed `unsafe-inline`                            | Fixed       | SEC/LIVE; dynamic nonces and prerender SHA-256 sources.                                                                                                                    |
| W5-F3    | Fragile raw JSON-LD script children                           | Fixed       | BND; centralized escaped serializer neutralizes script breakouts.                                                                                                          |
| W5-F4    | Unbounded local-storage parsing                               | Fixed       | BND; bounded readers reject oversized/malformed values.                                                                                                                    |
| W5-F5    | Divergent app security policies                               | Fixed       | SEC; canonical `site/shared/security-headers.ts`.                                                                                                                          |
| W6-P1-1  | Unbounded Stripe webhook buffering                            | Fixed       | SEC/BND; pre-parse body limit and webhook tests.                                                                                                                           |
| W6-P2-1  | Unbounded analytics properties storage                        | Fixed       | BND; bounded key/value/count schemas.                                                                                                                                      |
| W6-P2-2  | Telemetry parsed before rate limiting                         | Fixed       | SEC; limiter runs before body decoding.                                                                                                                                    |
| W6-P3-1  | Free-license provisioning race                                | Fixed       | BND; unique index migration `022` and idempotent insert path.                                                                                                              |
| W6-P3-2  | Vestigial OTP attempt guard                                   | Fixed       | SEC/BND; atomic accounting.                                                                                                                                                |
| W6-P3-3  | Internal operation names leaked in errors                     | Fixed       | SEC; sanitized external errors and structured internal logs.                                                                                                               |
| W6-P3-4  | Unbounded analytics error cardinality                         | Fixed       | BND; normalized bounded error values.                                                                                                                                      |
| W6-P3-5  | Route authentication metadata drift                           | Fixed       | SEC; route-registry contract tests.                                                                                                                                        |
| W6-P3-6  | Router buffered full bodies and cached mutable docs immutably | Fixed       | SEC; streaming/bounded handling and corrected cache policy.                                                                                                                |
| W6-P3-7  | Unused releases D1 privilege                                  | Fixed       | SEC; binding removed and dry-run verified.                                                                                                                                 |
| W7-P2    | Live local plaintext Alchemy secrets                          | Fixed       | `dd0b41b`; process environment or Secret Service only, no argv values.                                                                                                     |
| W7-P3-1  | Committed debug/scratch credentials                           | Fixed       | Exact artifacts removed and Gitleaks clean.                                                                                                                                |
| W7-P3-2  | Over-broad Gitleaks allowlist                                 | Fixed       | Exact-path historical fixture policy only.                                                                                                                                 |
| W7-P3-3  | Secret-shaped PoCs and E2E identity disclosure                | Fixed       | DED; manifests retain evidence without duplicated secret-shaped scripts; identities removed.                                                                               |
| W7-P3-4  | Turnstile secret declared as test plaintext var               | Accepted    | Value is Cloudflare's documented public always-pass test key in test-only config; production source-policy checks reject secret vars and production uses a secret binding. |
| W8-P2-1  | Override rationale mixed or undocumented                      | Fixed       | SUP; each override is package-scoped and documented.                                                                                                                       |
| W8-P2-2  | Alchemy brings Prisma toolchain                               | Accepted    | Upstream Alchemy dependency; not shipped in browser bundle and exact-pinned.                                                                                               |
| W8-P3-1  | Cross-workspace dependency drift                              | Accepted    | Migration-specific exact pins are independently audited; forced deduplication would violate tested peer sets.                                                              |
| W8-P3-2  | Unused `autoprefixer`                                         | Fixed       | Dependency and configuration removed.                                                                                                                                      |
| W8-P3-3  | Multiple esbuild versions                                     | Accepted    | Upstream toolchains require distinct exact versions; lifecycle trust is constrained and verified.                                                                          |
| W9-P0    | Router protocol-relative open proxy                           | Fixed       | SEC; same-origin URL construction and hostile-path tests.                                                                                                                  |
| W9-P1    | Router trusted client forwarding headers                      | Fixed       | SEC; forwarding headers stripped and rebuilt from edge data.                                                                                                               |
| W9-P2-1  | Script CSP `unsafe-inline`                                    | Fixed       | SEC/LIVE; nonce/hash rollout.                                                                                                                                              |
| W9-P2-2  | Unbounded dashboard session rows                              | Fixed       | BND; Effect schemas cap projected strings and row counts.                                                                                                                  |
| W9-P2-3  | Public JSON cache with unbounded keys                         | Fixed       | SEC; route allowlist and corrected cache policy.                                                                                                                           |
| W9-P3-1  | Admin params clamped in one layer and rejected in another     | Fixed       | `e2f9a5c`; one normalized contract.                                                                                                                                        |
| W9-P3-2  | Licensing failure lacked observability                        | Fixed       | `e58e9bd`; sanitized typed degradation events.                                                                                                                             |
| W9-P3-3  | Releases dead dot check and unvalidated latest body           | Fixed       | SEC; exact path and response-schema validation.                                                                                                                            |
| W9-P3-4  | Unbounded login input and raw error text                      | Fixed       | BND; bounded input and classified user-safe messages.                                                                                                                      |
| W9-P3-5  | Signup validator checked a constant                           | Fixed       | BND; actual request fields are schema-decoded.                                                                                                                             |
| W9-P3-6  | `/docsfoo` matched docs routing                               | Fixed       | SEC; segment-exact route matching.                                                                                                                                         |
| W10-P0-1 | Router arbitrary-origin fetch with credentials                | Fixed       | SEC; origin pinning, no credential forwarding, production duplicate disabled.                                                                                              |
| W10-P1-2 | Router cached and replayed `Set-Cookie`                       | Fixed       | SEC; cookie stripping before cache and response.                                                                                                                           |
| W10-P2-3 | Dead admin limiter binding                                    | Fixed       | SEC; limiter enforced before authorization/database work.                                                                                                                  |
| W10-P2-4 | Releases unused D1 binding                                    | Fixed       | SEC; removed from config/types.                                                                                                                                            |
| W10-P2-5 | Telemetry limiter keyed by attacker license value             | Fixed       | SEC; trusted address/digest keys and pre-parse limiting.                                                                                                                   |
| W10-P3-6 | API lacked security headers                                   | Fixed       | SEC/LIVE; shared baseline on all responses.                                                                                                                                |
| W10-P3-7 | Router forwarded spoofable proxy headers                      | Fixed       | SEC; strip/rebuild policy.                                                                                                                                                 |
| W10-P3-8 | Unvalidated latest version and unlimited downloads            | Fixed       | SEC; bounded validation plus `e441ece` fail-closed limiter.                                                                                                                |
| W10-P3-9 | Unlimited internal BFF routes                                 | Fixed       | SEC; independent internal limiter.                                                                                                                                         |
| W12-F01  | Solid dynamic responses had no headers                        | Fixed       | SEC/LIVE; shared middleware.                                                                                                                                               |
| W12-F02  | API duplicate `workers.dev` origin                            | Fixed       | SEC/LIVE; disabled and verified 404.                                                                                                                                       |
| W12-F03  | Router docs header downgrade                                  | Fixed       | SEC; hardened consistent docs policy.                                                                                                                                      |
| W12-F04  | Latent protocol-relative router proxy                         | Fixed       | SEC; strict origin/path checks.                                                                                                                                            |
| W12-F05  | Shadow/releases `workers.dev` posture gaps                    | Fixed       | Stage-gated shadow; releases configured off before any deployment.                                                                                                         |
| W12-F06  | API JSON lacked baseline headers                              | Fixed       | SEC/LIVE; shared response policy.                                                                                                                                          |
| W12-F07  | Script CSP `unsafe-inline`                                    | Fixed       | SEC/LIVE; nonce/hash rollout and user hydration smoke check.                                                                                                               |
| W12-F08  | Wildcard HTTPS image CSP                                      | Fixed       | `8a7c91e`; only same-origin, data, and GitHub avatars.                                                                                                                     |
| W12-F09  | CSP drift and stale Google form origin                        | Fixed       | SEC; one shared policy, Google removed.                                                                                                                                    |
| W12-F10  | Router forwarded `X-Forwarded-*`                              | Fixed       | SEC; hostile headers stripped.                                                                                                                                             |
| W12-F11  | Docs cache retained cookies / unsafe `Vary`                   | Fixed       | SEC; response normalization before cache.                                                                                                                                  |
| W12-F12  | Better Auth cookie flags implicit                             | Fixed       | Explicit Secure, HttpOnly, SameSite attributes in both runtimes.                                                                                                           |
| W12-F13  | Historical development-secret fallback needed live proof      | Fixed       | SEC/LIVE; fallback absent in source and live exploit control fails closed.                                                                                                 |

### AI-slop and cross-repository reports

| ID      | Finding                                          | Disposition | Evidence                                                                                                                                                                     |
| ------- | ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Y1-P0   | Two canonical framework trees                    | Accepted    | Intentional bounded migration; Svelte shadow cannot replace Solid until cutover gates pass.                                                                                  |
| Y1-P1   | Legal text maintained in both trees              | Accepted    | Temporary migration duplication; delete Solid copy at cutover rather than introduce content indirection.                                                                     |
| Y1-P2-1 | Landing datasets duplicated                      | Accepted    | Framework-specific rendering remains local during migration; shared product facts only where drift is dangerous.                                                             |
| Y1-P2-2 | SEO/JSON-LD/robots/sitemap duplicated            | Accepted    | Public contracts are parity-tested; framework runtime/header semantics differ.                                                                                               |
| Y1-P2-3 | Design tokens duplicated                         | Accepted    | Temporary visual parity layer; cross-framework CSS coupling rejected.                                                                                                        |
| Y1-P3-1 | Docs datasets duplicated                         | Accepted    | Solid tree will be deleted at cutover; dynamic Svelte docs intentionally own stage headers.                                                                                  |
| Y1-P3-2 | Auth error handling forked                       | Fixed       | Classified bounded auth errors and shared identity policy.                                                                                                                   |
| Y1-P3-3 | 404/error copy drift                             | Accepted    | Framework-native error surfaces; no security or contract drift.                                                                                                              |
| Y2-P0   | Session/request seam type family duplicated      | Dismissed   | Consumers intentionally project different minimum identity fields; all-fields superset would expose extra data.                                                              |
| Y2-P1a  | Email/schema vocabulary duplicated               | Fixed       | `eda6d32`; shared normalized email contract.                                                                                                                                 |
| Y2-P1b  | `parseInput` duplicated                          | Fixed       | `17b1344`; one licensing parse adapter.                                                                                                                                      |
| Y2-P2a  | Customer update contract duplicated              | Fixed       | Shared `site/shared/admin-customers.ts`.                                                                                                                                     |
| Y2-P2b  | Boundary input alias repeated                    | Dismissed   | Module-specific schema-encoded aliases preserve distinct boundary semantics.                                                                                                 |
| Y2-P3a  | Breakdown row restated shared type               | Fixed       | `821ec28`; shared overview item.                                                                                                                                             |
| Y2-P3b  | Inline role unions                               | Fixed       | `df7a5d2`; shared role contract.                                                                                                                                             |
| Y2-P3c  | Handwritten D1 rows duplicated schema inference  | Fixed       | `c7867e7`; schema-derived row types.                                                                                                                                         |
| Y3-P0   | Generic Effect decode-helper module              | Dismissed   | Decoders have different source context and typed error channels; generic wrapper would erase useful contracts.                                                               |
| Y3-P1-1 | One bounded-body reader for all runtimes         | Dismissed   | Worker/BFF readers deliberately have different limits, stream APIs, and error types.                                                                                         |
| Y3-P1-2 | Shared sitemap/robots/escaping                   | Dismissed   | Temporary framework-migration duplication is parity-tested; Svelte stage/noindex and Solid prerender semantics differ, and both old Solid generators are deleted at cutover. |
| Y3-P1-3 | Generic Worker D1 Effect wrapper                 | Dismissed   | Store operations expose domain-specific errors and transaction semantics; abstraction would add coupling.                                                                    |
| Y3-P1-4 | Three local `cn` helpers                         | Fixed       | Solid class merging centralized; obsolete copies removed.                                                                                                                    |
| Y3-P2-1 | Duplicate retention color ladders                | Dismissed   | Fabricated/obsolete analytics surfaces were deleted; no shared runtime need remains.                                                                                         |
| Y3-P2-2 | Parameterize dashboard load orchestration        | Dismissed   | One-caller abstraction failed deletion test; current orchestration is explicit and bounded.                                                                                  |
| Y3-P2-3 | Duplicate normalized email syntax                | Fixed       | `eda6d32`.                                                                                                                                                                   |
| Y3-P2-4 | Collapse typed errors into generic tagged errors | Dismissed   | Explicit domain errors are intentional public Effect channels.                                                                                                               |
| Y3-P3-1 | Consolidate small formatting helpers             | Dismissed   | Different nullability/display contracts; no proven behavioral duplication after dead UI removal.                                                                             |
| Y3-P3-2 | One toggle-chip component                        | Dismissed   | Unique controls do not justify a shared component.                                                                                                                           |
| Y3-P3-3 | Shared Solid HTTP micro-helpers                  | Dismissed   | Route-specific authentication, bounds, and response contracts must stay visible.                                                                                             |
| Y4-F1   | Shared router/release `proxyFetch`               | Dismissed   | Independent deployables have different trust and cache contracts; shared package adds operational coupling.                                                                  |
| Y4-F2   | Shared plain-text error builder                  | Dismissed   | Tiny status-specific responses are clearer inline.                                                                                                                           |
| Y4-F3   | Deduplicate worker configs                       | Dismissed   | Independent Workers intentionally retain explicit least-privilege manifests.                                                                                                 |
| Y4-F4   | Extract proxy identity setter                    | Dismissed   | One bounded router flow; helper would not reduce semantic duplication.                                                                                                       |
| Y4-F5   | Share headers across independent Workers         | Dismissed   | Policies differ by surface; dangerous app drift is centralized inside each deployment boundary.                                                                              |
| Y4-F6   | Shared URL parse gate                            | Dismissed   | Entry points have different allowed origins/routes; explicit gates are safer.                                                                                                |
| Y4-F7   | Per-request hop-header allocation                | Fixed       | Header-name set hoisted to module scope.                                                                                                                                     |
| Y4-F8   | Releases dead D1 config                          | Fixed       | Binding removed and types regenerated.                                                                                                                                       |
| Y5-P1-1 | Historical PoC whole-file fan-out                | Fixed       | `ce12a3d`; 27 hash manifests and CI integrity check.                                                                                                                         |
| Y5-P1-2 | Repeated historical `wrangler dev` bootstrap     | Dismissed   | Immutable finding evidence remains self-contained; runtime copies removed where byte-identical.                                                                              |
| Y5-P2-1 | Repeated PoC test request helpers                | Dismissed   | Historical isolated evidence; shared harness would rewrite proof provenance for negligible shipping LOC.                                                                     |
| Y5-P2-2 | Repeated shell signature helpers                 | Dismissed   | Finding-specific historical evidence retained by hash/provenance policy.                                                                                                     |
| Y5-P3-1 | Tool-script preamble overlap                     | Dismissed   | Different policy inputs/outputs; report itself marked this dismissed.                                                                                                        |
| Y5-P3-2 | Minor Oxlint walker duplication                  | Dismissed   | Upstream-owned vendored plugin; local fork prohibited.                                                                                                                       |
| Y5-P3-3 | Repetitive historical report prose               | Dismissed   | Evidence records remain immutable; shipping bundle unaffected.                                                                                                               |
| Y6-P0-1 | Seven dead CLI/API routes                        | Coordinated | Web routes and supported endpoints aligned; Rust stream owns final CLI contract proof.                                                                                       |
| Y6-P0-2 | Feature/tier catalog divergence                  | Coordinated | Web grants aligned; Rust stream verifies the matching catalog.                                                                                                               |
| Y6-P1-1 | Diverged installer copies                        | Coordinated | Canonical installer rebuilt/deployed/hash-verified; Rust stream owns release-source synchronization.                                                                         |
| Y6-P1-2 | Lossy telemetry contract duplication             | Coordinated | Web boundary is strict/backward-compatible; generated cross-language contract remains Rust-stream work.                                                                      |
| Y6-P2-1 | JWT claim shape duplicated                       | Coordinated | Production issuer/audience/key fixed on both known sides; final Rust verification pending.                                                                                   |
| Y6-P2-2 | Machine schema family duplicated                 | Coordinated | Web projections consolidated and privacy-bounded; Rust machine model alignment pending.                                                                                      |
| Y6-P2-3 | Validate-license request/response drift          | Coordinated | Live web response is bounded and schema-decoded; Rust client contract proof pending.                                                                                         |
| Y6-P3-1 | Install-ping and usage-report field drift        | Coordinated | Web accepts canonical bounded fields; Rust sender alignment pending.                                                                                                         |
| Y6-P3-2 | Rust response structs duplicated                 | Coordinated | No unsafe web fallback added; assigned wholly to Rust stream.                                                                                                                |

### Non-ranked slop-cluster disposition

| Reports     | Disposition                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2, W6, W10 | Authentication, rate-limit, and response-policy repetition was consolidated only where contracts matched; generic store/error wrappers were rejected because they erase domain errors. |
| W4, W8      | Dependency/version overlap is exact-pinned and audited; upstream toolchain duplication is accepted instead of force-deduplicated.                                                      |
| W5, W12     | Security policy drift is centralized; framework-specific SEO/render plumbing remains local until cutover.                                                                              |
| W7          | Scratch and secret-shaped copies were removed or exact-path constrained; historical evidence integrity is preserved.                                                                   |
| W9          | Boundary helpers are shared only at proven seams; route-specific validation remains explicit.                                                                                          |
| Y1–Y5       | Every ranked cluster is represented above; remaining evidence-only clusters were either deleted with obsolete UI or rejected under the documented deletion test.                       |

## Current open order

1. Complete `audit-y6.md` with the Rust remediation stream.

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
