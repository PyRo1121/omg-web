# Stage 01 — Advisory Intelligence & Dependency Risk

**Target:** `PyRo1121/omg-web` · **Mode:** deep · **Phase:** P1 (Intelligence & Dependency Risk)
**Generated:** 2026-08-23 · **Head commit:** `6eb3c8e` (branch `main`)

---

## Advisory Inventory

### Current-state scan (point-in-time)

| Workspace | npm audit result |
|---|---|
| root (`omg-web`) | 0 vulnerabilities (all severities) |
| `site` (`omg-site`) | 0 vulnerabilities |
| `site/workers` (`omg-saas-workers`) | 0 vulnerabilities |
| `workers/router` (`omg-router`) | 0 vulnerabilities |

No first-party GitHub Security Advisories exist for `PyRo1121/omg-web` (`gh api repos/PyRo1121/omg-web/security-advisories` → empty). The repo has no published releases/CVEs of its own; all advisory signal is dependency-side.

### Historical coverage metadata

- **Tier reached:** Tier 2 — expanded beyond last 2 years to full history per direct dependency
- **Total advisories collected:** **60 unique GHSA IDs** (via OSV batch query over all 32 direct npm deps), mapped to ~55 CVEs. Recent-2yr subset ≈ 41; older ≈ 19.
- **Severity distribution:** CRITICAL: 5, HIGH: 26, MODERATE: 23, LOW: 6
- **Repository identity:** `PyRo1121/omg-web` — resolved from `piolium/audit-state.json` → `repository` field; confirmed by git remote
- **Git history available:** `true`
- **Coverage gaps recorded:** none material. NVD keyword pass skipped as redundant (OSV already aggregates GHSA + CVE with richer range data for npm). Source 5 web search not needed: structured sources returned complete coverage.

### Ranked advisory table (deduplicated; severity DESC, published DESC)

Legend: **AFFECTS PINNED = no** means the version pinned in this repo (`site/package.json`, root, `site/workers`) is at or above the patched release on that major branch.

| # | ID (GHSA / CVE) | Sev | Package | Affected → Fixed | Affects pinned? | Component / bug class |
|---|---|---|---|---|---|---|
| 1 | GHSA-xg6x-h9c9-2m83 / CVE-2026-67337 | CRITICAL | better-auth | <1.4.9 → 1.4.9 | No (pin 1.7.1) | Auth: 2FA bypass via premature session caching |
| 2 | GHSA-pw9m-5jxm-xr6h / CVE-2026-53512 | CRITICAL | better-auth | <1.6.11 → 1.6.11 | No | Auth: OAuth refresh-token replay via missing client auth on oidcProvider plugin |
| 3 | GHSA-f8mp-x433-5wpf / CVE-2023-7080 | CRITICAL | wrangler | <3.19.0 → 3.19.0 | No (pin 4.125.0) | Dev tooling: RCE in `wrangler dev` sandbox |
| 4 | GHSA-9crc-q9x8-hgqq / CVE-2025-24964 | CRITICAL | vitest | ≤3.x → 3.0.5+ | No (pin 4.1.11) | Dev tooling: browser-mode RCE via malicious website while vitest runs |
| 5 | GHSA-5xrq-8626-4rwp / CVE-2026-47429 | CRITICAL | vitest | <4.1.0 → 4.1.0 | No | Dev tooling: UI server arbitrary file read+execute |
| 6 | GHSA-qq9h-g4jm-xgf3 / CVE-2026-67327 | HIGH | better-auth | <1.6.22 → 1.6.22 | No | Auth: pre-account hijack on magic-link/email OTP signup |
| 7 | GHSA-86j7-9j95-vpqj / CVE-2026-67333 | HIGH | better-auth | <1.6.13 → 1.6.13 | No | XSS: stored XSS in auth-server origin via `javascript:` redirect_uri |
| 8 | GHSA-9h47-pqcx-hjr4 / CVE-2026-67336 | HIGH | better-auth | <1.6.11 → 1.6.11 | No | Crypto: oidcProvider advertises `alg=none` insecure default |
| 9 | GHSA-wxw3-q3m9-c3jr / CVE-2026-67335 | MODERATE | better-auth | <1.6.2 → 1.6.2 | No | Auth: OAuth callback accepts mismatched state w/ cookie-backed storage |
| 10 | GHSA-2vg6-77g8-24mp / CVE-2026-67334 | LOW | better-auth | <1.6.11 → 1.6.11 | No | Auth: stale sessions persist after user deletion |
| 11 | GHSA-g38m-r43w-p2q7 / CVE-2026-53516 | HIGH | better-auth | <1.6.11 → 1.6.11 | No | Auth: account takeover via OAuth auto-link to unverified pre-existing email |
| 12 | GHSA-fmh4-wcc4-5jm3 / CVE-2026-53514 | HIGH | better-auth | <1.6.11 → 1.6.11 | No | Auth: unauthorized invitation acceptance via unverified email |
| 13 | GHSA-392p-2q2v-4372 / CVE-2026-53517 | HIGH | better-auth | <1.6.0 → 1.6.0 | No | Auth: refresh-token rotation forks token family on concurrent requests |
| 14 | GHSA-7w99-5wm4-3g79 / CVE-2026-53518 | HIGH | @better-auth/oauth-provider | <1.6.11 → 1.6.11 | n/a (not a dep) | Auth: concurrent code-grant replay |
| 15 | GHSA-cq3f-vc6p-68fh / CVE-2026-45337 | HIGH | better-auth | <1.6.11 → 1.6.11 | No | Auth: device authorization approve/deny accepts any authenticated session |
| 16 | GHSA-p9ff-h696-f583 / CVE-2026-39363 | HIGH | vite | 6.x <6.4.2 → 6.4.2 | No (pin 6.4.3) | Path traversal: arbitrary file read via dev-server WebSocket |
| 17 | GHSA-v2wj-q39q-566r / CVE-2026-39364 | HIGH | vite | 6.x <6.4.2 → 6.4.2 | No | Path traversal: `server.fs.deny` bypassed with queries |
| 18 | GHSA-fx2h-pf6j-xcff / CVE-2026-53571 | HIGH | vite | <6.4.3 (also 7.x<7.3.5, 8.x<8.0.16) | No (exactly fixed at pin) | Path traversal: fs.deny bypass on Windows alternate paths |
| 19 | GHSA-v6wh-96g9-6wx3 / CVE-2026-53632 | MODERATE | launch-editor (via vite) | <6.4.3 | No | Info disclosure: NTLMv2 hash leak via UNC path (Windows) |
| 20 | GHSA-4w7w-66w2-5vf9 / CVE-2026-39365 | MODERATE | vite | <6.4.2 | No | Path traversal in optimized-deps `.map` handling |
| 21 | GHSA-gpj5-g38j-94v9 / CVE-2026-39356 | HIGH | drizzle-orm | <0.45.2 → **0.45.2 (exact)** | No (pin exactly 0.45.2) | Injection: SQL injection via improperly escaped SQL identifiers |
| 22 | GHSA-36p8-mvp6-cv38 / CVE-2026-0933 | HIGH | wrangler | <4.59.1 → 4.59.1 | No (pin 4.125.0) | Command injection in `wrangler pages deploy` |
| 23 | GHSA-38f7-945m-qr2g / CVE-2026-32887 | HIGH | effect | <3.20.0 → 3.20.0 | No (pin 3.22.1) | AsyncLocalStorage context lost/contaminated across fibers (isolation break) |
| 24 | GHSA-r28c-9q8g-f849 / CVE-2026-73646 | HIGH | postcss | <8.5.18 → 8.5.18 | No (pin 8.5.26) | Path traversal: source-map auto-loading reads attacker-controlled paths |
| 25 | GHSA-6g55-p6wh-862q / CVE-2026-45623 | HIGH | postcss | <8.5.12 → 8.5.12 | No | Arbitrary file read/info disclosure via sourceMappingURL |
| 26 | GHSA-fxqj-rqcc-2cmp / CVE-2026-69153 | MODERATE | postcss | <8.5.23 → 8.5.23 | No | **Incomplete fix of #25** — attacker-controlled sourceMapping persists |
| 27 | GHSA-qx2v-qp2m-jg93 / CVE-2026-41305 | MODERATE | postcss | <8.5.10 → 8.5.10 | No | XSS via unescaped `</style>` in CSS stringify output |
| 28–34 | GHSA-hwj9-…, GHSA-566m-…, GHSA-7fh5-… (CVE-2021-23368, CVE-2021-23382, CVE-2023-44270) | MODERATE ×3 | postcss | legacy | No | ReDoS + line-return parsing error |
| 35 | GHSA-vp58-j275-797x / CVE-2025-71403 | HIGH | better-auth | <1.1.21 → 1.1.21 | No | Auth: trustedOrigins bypass → account takeover |
| 36 | GHSA-99h5-pjcv-gr6v / CVE-2025-61928 | HIGH | better-auth | <1.3.26 → 1.3.26 | No | Auth: unauthenticated API-key creation through api-key plugin |
| 37 | GHSA-p6v2-xcpg-h6xw / CVE-2026-45364 | HIGH | better-auth | <1.4.17 → 1.4.17 | No | Rate-limit bypass: IPv6 addresses keyed individually |
| 38 | GHSA-x732-6j76-qmhm / CVE-2025-71399 | HIGH | better-auth (rou3 router) | <1.4.5 → 1.4.5 | No | Routing: double-slash path normalization bypasses route guards |
| 39 | GHSA-569q-mpph-wgww / CVE-2025-71401 | LOW | better-auth | <1.4.2 → 1.4.2 | No | DoS: external request basePath modification |
| 40 | GHSA-wmjr-v86c-m9jj / CVE-2025-71402 | LOW | better-auth | <1.4.0 → 1.4.0 | No | Auth: forged cookies revoke arbitrary sessions (multi-session sign-out hook) |
| 41 | GHSA-9x4v-xfq5-m8x5 / CVE-2025-71404 | MODERATE | better-auth | <1.1.16 → 1.1.16 | No | XSS: reflected HTML injection via URL parameter |
| 42 | GHSA-8jhw-6pjj-8723 / CVE-2024-56734 | HIGH | better-auth | <1.1.6 → 1.1.6 | No | Open redirect in verify-email endpoint |
| 43 | GHSA-hjpm-7mrm-26w8 / CVE-2025-27143 | MODERATE | better-auth | <1.1.20 → 1.1.20 | No | Open redirect via scheme-less callback parameter |
| 44 | GHSA-36rg-gfq2-3h56 / CVE-2025-53535 | LOW | better-auth | <1.2.10 → 1.2.10 | No | Open redirect in originCheck middleware |
| 45 | GHSA-3qxh-p7jc-5xh6 / CVE-2025-27109 | HIGH | solid-js | <1.9.4 → 1.9.4 | No (pin 1.9.15) | XSS: JSX fragment HTML escaping missing |
| 46–60 | vite historical cluster: GHSA-mv48 (CVE-2022-35204 dir traversal), GHSA-353f (CVE-2023-34092 fs.deny bypass //), GHSA-c24v (CVE-2024-23331 case-insensitive fs bypass), GHSA-92r3 (CVE-2023-49293 transformIndexHtml XSS), GHSA-64vr/9cwx (CVE-2024-45812/45811 DOM clobbering XSS, ?import&raw bypass), GHSA-8jhw-289h (CVE-2024-31207 directory-pattern fs.deny), GHSA-c27g (CVE-2024-52011 launch-editor cmd injection Win), GHSA-vg6x (CVE-2025-24010 CORS-less dev server read), GHSA-x574 (CVE-2025-30208 ?raw?? bypass), GHSA-xcj6 (CVE-2025-31486 .svg/relative bypass), GHSA-4r4m (CVE-2025-31125 inline/raw ?import bypass), GHSA-859w (CVE-2025-46565 `/.` bypass), GHSA-356w (CVE-2025-32395 invalid request-target), GHSA-g4jq/jqfw (CVE-2025-58751/58752 public-dir prefix serve, fs settings vs HTML) | MIXED (2 HIGH legacy, rest MOD) | vite | various → all ≤6.4.3 | No (pin 6.4.3) | Dev-server file access & request parsing cluster — see Patch Quality Signals |
| 61 | GHSA-8c93-4hch-xgxp / CVE-2023-3348 | MODERATE | wrangler | <2.20.1 → 2.20.1 | No | Directory traversal in wrangler |
| 62 | GHSA-cfph-4qqh-w828 / CVE-2023-7079 | MODERATE | wrangler | <3.19.0 → 3.19.0 | No | Arbitrary remote file read in wrangler dev |

**First-party remediation history (Source 1, local git):**

- `90daa79` — *fix(security): resolve 3 high-severity dependency vulnerabilities*: added overrides for `h3 ≥1.15.5` (request smuggling), `tar ≥7.5.8` (arbitrary file write), `minimatch ≥10.2.1` (ReDoS).
- Renovate vulnerability-driven PRs merged: `#21` kysely, `#32` vite, `#34` drizzle-orm, `#42` postcss, `#43` vitest.
- `082b4d6` — *chore: remediate site dependency vulnerabilities* (bulk lockfile remediation).
- Standing security overrides still present in `site/package.json`: `follow-redirects=1.16.0`, `node-forge=1.4.0`, `serialize-javascript=7.1.0`, `picomatch` pins, `nitropack=2.13.4`, `dax-sh→dax`.

---

## Vulnerability Pattern Analysis

### 2a. Component Vulnerability Heatmap

| Rank | Component | Advisories | Severity mix | Dominant bug types | Heat |
|---|---|---|---|---|---|
| 1 | **better-auth** (auth server, incl. rou3 router + oauth-provider subpackages) | 22 | 2 CRIT / 12 HIGH / 5 MOD / 3 LOW | Auth bypass/ATO (10), open redirect (3), XSS (2), rate-limit bypass (1), DoS (1), crypto default (1), session lifecycle (2), SQLi-adjacent routing (1), 2FA bypass (1) | 🔴 HIGH — and it owns every production credential path in this app |
| 2 | **vite** (+ launch-editor transitive) | 22 | 2 HIGH legacy / 15 MOD / rest LOW | fs.deny/path-traversal bypass (≈13 distinct!), dev-server request smuggling (2), DOM-clobbering XSS (2), cmd injection via launch-editor (1) | 🔴 HIGH count but dev-only reachability |
| 3 | **postcss** (+ source-map handling) | 7 | 2 HIGH / 5 MOD | Path traversal/file-read via sourceMappingURL (2), XSS in stringify output (1), ReDoS (3+) | 🟠 MEDIUM — build-time only here |
| 4 | **wrangler** | 4 | 1 CRIT / 1 HIGH / 2 MOD | RCE in dev sandbox, cmd injection in deploy, dir traversal | 🟠 build/deploy tooling only |
| 5 | **vitest** | 2 | 2 CRITICAL | Browser-mode/UI-server RCE + file read/exec | 🟠 CI/dev-only, but both CRITICAL |
| 6 | drizzle-orm | 1 | 1 HIGH | SQL injection via identifier escaping | 🟡 single, patched exactly at pin |
| 7 | effect | 1 | 1 HIGH | Fiber context contamination (ALS isolation break) | 🟡 relevant to any authz logic built on Effect context |
| 8 | solid-js | 1 | 1 HIGH | XSS via unescaped JSX fragments | 🟡 rendering-layer XSS precedent |

**High-heat components for Phase 3/5:** `better-auth` integration surface (this repo's own handlers around it), then the SSR/API boundary where `drizzle-orm` + `effect` meet D1.

### 2b. Bug Type Recurrence

| Bug Class | CWEs | Count | Recurring? |
|---|---|---|---|
| Path traversal / file-read / fs-deny bypass | CWE-22, CWE-200 | ~17 (13× vite, 2× postcss, 1× wrangler, 1× vitest) | ✅ STRONGLY recurring |
| Auth bypass / broken auth / ATO | CWE-287, CWE-306, CWE-862, CWE-384 | ~12 (better-auth dominant) | ✅ STRONGLY recurring |
| Open redirect / origin validation | CWE-601 | 3 (better-auth) | ✅ recurring |
| XSS | CWE-79 | ~5 (solid-js JSX, better-auth stored/reflected, postcss stringify, serialize-javascript override history) | ✅ recurring |
| RCE (dev tooling) | CWE-78, CWE-94 | 4 (vitest ×2, wrangler dev, launch-editor) | ✅ recurring (non-prod) |
| Request smuggling / HTTP parsing | CWE-444 | 2 (h3 override, vite request-target) | ⚠️ pair |
| ReDoS / DoS | CWE-400, CWE-1333 | ~6 (minimatch, picomatch, postcss ×3, better-auth basePath) | ✅ recurring |
| Cryptographic weakness | CWE-327 | 1 (better-auth alg=none) | — |
| SQL injection | CWE-89 | 1 (drizzle-orm identifiers) | ⚠️ watch: repo hand-builds D1 queries |
| Context/isolation confusion | CWE-668-ish | 1 (effect ALS) | — |

### 2c. Attack Surface Trends

Ranked exploited input vectors across the corpus:

1. **HTTP request paths/queries to a local dev/file-serving endpoint** (vite fs.deny family, wrangler/vitest dev servers) — overwhelmingly the most common vector. *Prod-reachability in this repo: low (dev servers not exposed), but the same pattern class (path normalization before authorization) applies to the omg-site asset binding and API routing.*
2. **OAuth/OIDC callback parameters and redirect URIs** (better-auth ×6: redirect_uri javascript:, open redirects ×3, state mismatch, token replay/fork) — *directly prod-relevant: this app uses better-auth with magic-link/email OTP and just added native Cloudflare email sending.*
3. **Session/token lifecycle races** (concurrent refresh rotation, device-approval confusion, stale sessions post-delete, forged multi-session cookies) — prod-relevant.
4. **Email/link-based account flows** (pre-account hijack on magic-link signup, unverified-email invite acceptance, verify-email redirect) — prod-relevant given OTP/magic-link usage.
5. **Build-input files (CSS source maps, raw imports)** (postcss, vite `?raw?import`) — build-time.
6. **Rate-limiter key derivation** (IPv6 individual keying) — directly relevant: this worker configures three Cloudflare rate limiters keyed by IP/user.

### 2d. Patch Quality Signals (structural recurrence)

| Component | Same-class repeat patches | Evidence | Verdict |
|---|---|---|---|
| **vite `server.fs.deny`** | ~10 separate advisories patching the *same mechanism* (double slash, `?raw?`, `.svg`, relative, `/.`, directory patterns, queries, Windows alt-paths, backslash, request-target) | GHSA-353f, x574, xcj6, 859w, 8jhw-289h, c24v, v2wj, 4w7w, fx2h, g4jq/jqfw, p9ff, 93m4 | **structural-recurrence candidate** — root cause is allowlist-style deny matching without canonical path normalization; assume future bypasses |
| **better-auth origin/callback validation** | trustedOrigins bypass + 3 open redirects + state mismatch + redirect_uri scheme confusion | GHSA-vp58, 8jhw-6pjj, hjpm, 36rg, wxw3 | **structural-recurrence candidate** — origin/redirect validation repeatedly incomplete |
| **postcss source-map loading** | fix then explicit *incomplete-fix* advisory | GHSA-6g55 → GHSA-fxqj | **confirmed incomplete patch pattern** |
| **better-auth rate limiter keying** | IPv6 keying bypass after multiple rate-limit features shipped | GHSA-p6v2 | flag when auditing this repo's own `[[ratelimits]]` config (IP-keyed, 3 namespaces) |

> **Audit targeting recommendations:** Phase 3 should prioritize DFD slices for (1) the **auth boundary**: Better Auth routes on `omg-api.latham.cloud` ↔ D1 auth tables ↔ OTP email send_email binding; (2) the **BFF service-binding flow** `omg-site` → `LICENSING_API` (`omg-saas`); (3) the **shared-D1 trust boundary** between the two workers. Phase 5 deep probe should target entry points: OAuth/magic-link callback parameters, OTP request/response handling (fresh native email path, commit `6eb3c8e`), Stripe webhook ingestion (`stripe_event_inbox`, signature verification), admin API behind ADMIN_API_SECRET + rate limiter, and Turnstile-optional flows. Phase 10 chambers should include **open redirect/origin-validation**, **path-normalization-before-authz**, **session lifecycle/race**, **XSS via unescaped rendering**, and **SQL identifier injection** as mandatory modes. Patch-bypass-checker should treat **vite fs-deny style deny-lists** and **any hand-rolled origin checks** as structural-recurrence targets.

---

## Architecture Inventory

**Components / processes**

| Unit | Role | Deployment |
|---|---|---|
| `omg-site` (SolidStart/vinxi SSR worker) | Marketing site + web app surface, serves static assets via Workers Static Assets binding `ASSETS`; SSR/API invokes the Worker | Deployed, custom domain `omg.latham.cloud` |
| `omg-saas` (`site/workers`) | SaaS API: licensing, telemetry ingest, OTP issuance, Stripe billing/webhooks, admin API; Sentry + observability | Deployed, `omg-api.latham.cloud` |
| `workers/router` (`omg-router`) | Docs router | In-repo only, **not deployed** |
| `workers/releases` | Release download handler | In-repo only, **not deployed** (no package.json manifest) |
| Core Rust CLI/daemon | Out of repo (`PyRo1121/omg`) — consumes licensing API presumably | External |

**Transports**

- Public HTTPS to two custom domains (internet-facing edge).
- Cloudflare **Service Binding** `LICENSING_API` → `omg-saas` ("private licensing API calls from the same-origin BFF") — intra-cloud RPC, not network-exposed.
- Cloudflare **send_email binding** (`EMAIL`) — native email sending for OTP (newly introduced, replacing Resend API-key path).
- **Stripe webhooks** ingress into `omg-saas` (signature-verified event inbox table).
- **Cron trigger** `0 2 * * *` on `omg-saas` (daily job — likely reconciliation/cleanup).
- Cloudflare **D1 SQL** (both workers), Cloudflare **rate limiters** (admin 100/min/user, auth 10/min/IP, telemetry 100/min/license).

**Trust boundaries**

1. Internet ↔ `omg.latham.cloud` (public site; static assets free tier, SSR worker paid).
2. Internet ↔ `omg-api.latham.cloud` (unauthenticated endpoints: auth/OTP/telemetry ingest/Stripe webhooks; authenticated: license/admin).
3. BFF (`omg-site`) → `omg-saas` via service binding (assumes same-origin trust — verify the binding isn't reachable with spoofable headers).
4. `omg-site` ↔ `omg-saas` **share one physical D1 database** (`omg-platform`, noted "final D1 slot on Free plan") — two codebases writing the same DB with different ownership claims ("Better Auth owns only its four auth tables") — ownership-by-convention, not enforcement.
5. Secrets plane: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JWT_SECRET`, `ADMIN_USER_ID`, `RESEND_API_KEY` (legacy), `ADMIN_API_SECRET`, optional `TURNSTILE_SECRET_KEY`, `SENTRY_DSN` via `wrangler secret put`.
6. CI/CD: GitHub Actions with SHA-pinned actions; gitleaks configured (`.gitleaks.toml`).

**Execution environments:** Cloudflare Workers (workerd, `nodejs_compat` flag), smart placement; D1; no containers/serverless-other.

**Highest-risk flows for Phase 3 DFD slices:** (a) anonymous → OTP request → email link → session creation (fresh code, email vector, pre-account-hijack advisory history in better-auth); (b) Stripe webhook → signature check → event inbox → entitlement update; (c) cross-worker shared-D1 writes where row ownership is convention only; (d) admin API (single `ADMIN_USER_ID` + `ADMIN_API_SECRET` secret + IP rate limit — IPv6-keying bypass precedent in better-auth applies).

---

## Component Inventory

Full machine-readable inventory: `piolium/attack-surface/sbom.json` (50 components).

| Component | Category | Version | Purpose | Sec-relevant? |
|---|---|---|---|---|
| node | runtime | >=24 | Build/test runtime | ✔ |
| npm | runtime | 12.0.2 | Package manager | – |
| workerd | runtime | 1.20260820.1 | Workers runtime | ✔ |
| @solidjs/start / solid-js / vinxi / tailwindcss | framework | 1.3.2 / 1.9.15 / 0.5.11 / 4.3.3 | SSR meta-framework / rendering / bundler layer / styling | ✔ (solid-js XSS history) |
| **better-auth** | package | 1.7.1 | Auth server: sessions, OAuth, OTP, magic links | ✔ highest advisory density (22) |
| **drizzle-orm** | package | 0.45.2 | ORM over D1 | ✔ SQLi-via-identifiers history (patched exactly at pin) |
| **effect** | package | 3.22.1 | Schema boundary parsing, fiber runtime | ✔ ALS context-contamination advisory |
| @sentry/solid, @sentry/cloudflare | package | 10.70.0 | Error monitoring | – |
| @kobalte/core, @tanstack/solid-query, @solidjs/router, @solidjs/meta, @solid-primitives/* , clsx, cmdk-solid, lucide-solid, shiki, simple-icons, tailwind-merge | package | pinned | UI/data-fetch/docs-highlight utilities | – |
| **vite** | package | 6.4.3 | Dev server/bundler | ✔ 22 advisories, fs-deny structural recurrence |
| **vitest** | package | 4.1.11 | Test runner | ✔ 2 CRITICAL (dev-only) |
| **wrangler** (+wrangler-cli binary) | package/binary | 4.125.0 | Deploy/D1 migrate/dev | ✔ RCE & traversal history (dev/deploy only) |
| **postcss** | package | 8.5.26 | CSS pipeline | ✔ source-map traversal (incomplete-fix pattern) |
| autoprefixer, @tailwindcss/postcss, @playwright/test, @cloudflare/vitest-plugin, typescript, prettier(+plugin), oxlint(+plugins), @types/node | package | pinned | Build/test/lint toolchain | – |
| transitive-dependency-overrides (h3, tar, minimatch, follow-redirects, node-forge, serialize-javascript, nitropack, picomatch, dax-sh→dax) | package | pinned values | Security pins for vulnerable transitives | ✔ evidence of past supply-chain exposure |
| cloudflare-d1 (`omg-platform`) | datastore | unknown | Shared SQLite for auth/licensing/analytics/OTP/stripe-inbox | ✔ shared between two workers |
| stripe | external-service | – | Billing + signed webhooks | ✔ money/authz path |
| cloudflare-email-sending (`EMAIL` binding) | external-service | native | OTP delivery | ✔ new code path (commit 6eb3c8e) |
| resend | external-service | legacy | Prior OTP provider (key still provisioned) | ✔ legacy credential to remove |
| turnstile | external-service | optional | Bot protection | ✔ optional ⇒ fail-open risk to probe |
| sentry-saas (DSN) | external-service | – | Telemetry egress | – |
| actions/checkout, setup-node, upload-artifact | build-ci | v4 (SHA-pinned) | CI | – |
| renovate | build-ci | configured | Automated updates incl. vuln-driven PRs | ✔ positive control |

**Counts:** total 50 — runtime: 3, package: 32, framework: 4, datastore: 1, external-service: 5, build-ci: 4, binary: 1.

**Coverage gaps (verbatim from sbom.json):**
- no Dockerfile or devcontainer found — container-os category not enumerated
- no vendored/third_party code detected — vendored category empty
- `workers/releases` has tsconfig+src but no package.json manifest — its dependencies (if any) unresolved
- transitive dependency tree skipped by scope; transitive posture inferred only via npm audit results (0 vulnerabilities across all 4 workspaces) and historical overrides

---

## Dependency Intelligence (security-relevant subset, derived view)

| Dependency | Why flagged | Runtime context | Pattern cross-reference |
|---|---|---|---|
| **better-auth 1.7.1** | 22 lifetime advisories (2 CRIT, 12 HIGH); structural recurrence in origin/redirect validation and rate-limit keying | Owns all production authentication: session/account/verification tables in shared D1; wired to magic-link + OTP email flows; new native email path landed in HEAD commit | 2b auth-bypass recurrence; 2c vectors 2 & 4; 2d structural-recurrence. **Primary Phase 5 target.** Verify all plugins in use (oidcProvider? api-key? multi-session?) are actually enabled — several CRIT/HIGH advisories are plugin-scoped |
| **drizzle-orm 0.45.2** | CVE-2026-39356 SQLi via identifier escaping; pin sits **exactly on the fixed version** — zero margin | All D1 access goes through it plus hand-written migrations | 2b SQLi class. Hunt for `sql.raw`/template-interpolated identifiers/column names derived from client input in `site/workers/src/handlers` |
| **effect 3.22.1** | CVE-2026-32887 fiber context contamination (fixed 3.20.0; pin is past fix) | Used for schema boundary parsers in telemetry + licensing contracts | If authz decisions ride on Effect-provided context, contamination class matters — check for ambient context crossing requests |
| **solid-js 1.9.15** | CVE-2025-27109 JSX escaping XSS (fixed 1.9.4) | All rendered surfaces, including docs/code samples highlighted via shiki | 2b XSS class. Probe any `innerHTML`/`@html` usage with user- or DB-derived content |
| **vite 6.4.3** | 22 advisories; fs.deny deny-list mechanism structurally recurrent | Dev/build only; never deployed to the edge runtime | 2d structural-recurrence; low prod reachability — do not over-invest in Phase 5 |
| **vitest 4.1.11 / wrangler 4.125.0 / postcss 8.5.26** | CRITICAL RCEs (vitest), dev-server RCE/traversal (wrangler), source-map traversal w/ incomplete fix (postcss) | Local dev + CI only | Supply-chain/CI angle: ensure `vitest --ui`/browser mode never exposed in CI runners on untrusted PRs; note `allowScripts` entries (esbuild, workerd, @parcel/watcher) as install-script attack surface |
| **transitive overrides set** | Demonstrates real past exposure: h3 request smuggling, tar arbitrary write, minimatch ReDoS, follow-redirects, node-forge, serialize-javascript | Enforced in `site/package.json` overrides | Positive control — keep renovate watching these pins; drift would silently reintroduce known-bad versions |
| **resend (legacy)** | `RESEND_API_KEY` secret still listed as required in wrangler.toml comments though email moved to native binding | Dead-or-dying credential | Flag in secrets hygiene review (Phase 2/insecure-defaults): confirm removal or rotation |

### Key takeaways for downstream phases

1. The application's biggest *product-level* risk concentration is the **Better Auth integration**, not any single CVE — its advisory history shows the failure modes (origin validation, redirect handling, session lifecycle, rate-limit keying) recur even in patched versions. Audit *this repo's configuration* of better-auth (trustedOrigins list, cookie settings, plugin enablement, callback URL handling) rather than assuming library safety.
2. **Shared D1 between two independently deployed workers** is an architecture-level trust-boundary smell; row-ownership conventions ("Better Auth owns only its four auth tables") have no enforcement mechanism visible.
3. **Turnstile is optional** and rate limits are IP-keyed — combine with better-auth's IPv6 rate-limit bypass precedent for an abuse-path hypothesis on OTP endpoints.
4. Dev-tool advisories (vite/vitest/wrangler) are numerous but dev-scoped; prioritize them below the production auth/telemetry/billing surfaces except for CI hardening (install scripts allowed: esbuild, workerd, @parcel/watcher).
