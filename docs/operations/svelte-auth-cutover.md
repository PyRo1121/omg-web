# SvelteKit auth cutover plan

**Status:** draft plan; no production change has been made
**Scope:** moving `/api/auth/*` from the SolidStart `omg-site` Worker to the SvelteKit `OmgSvelteSite` Alchemy stack at domain cutover

This plan assumes the state recorded in [`cloudflare-environment-readiness.md`](./cloudflare-environment-readiness.md) (shadow topology, shared-database ownership contract, live characterization results) and the auth compatibility gate in [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md) (§6, "Auth compatibility gate").

## 1. Current state: two independent auth runtimes, non-portable sessions

| Runtime    | Owner                                           | Auth entrypoint                                                                                                        | Secret source                                                                                   |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Production | `omg-site` Worker (`site/wrangler.toml`)        | `site/src/routes/api/auth/[...auth].ts` → `createAuth()` in [`site/src/lib/auth.ts`](../../site/src/lib/auth.ts)       | write-only `BETTER_AUTH_SECRET` Wrangler secret plus `BETTER_AUTH_URL=https://omg.latham.cloud` |
| Shadow     | SvelteKit Worker (`site-svelte/alchemy.run.ts`) | `createShadowAuth()` in [`site-svelte/src/lib/server/auth.server.ts`](../../site-svelte/src/lib/server/auth.server.ts) | `Alchemy.Random('ShadowAuthSecret')` bound as its own `BETTER_AUTH_SECRET`                      |

Both runtimes mount Better Auth `1.7.1` against the retained `omg-platform` D1 tables (`auth_user`, `auth_session`, `auth_account`, `auth_verification`), with signup disabled and GitHub as the only social provider.

### Alchemy deployment input injection

`site-svelte/.env` is not used. `npm run plan`, `deploy`, `dev`, and `destroy`
run through `site-svelte/alchemy.environment.mjs`. Shadow and non-production
stages require `CLOUDFLARE_ACCOUNT_ID`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, and `SVELTE_BFF_SECRET`. The `prod` stage deliberately
refuses those shadow GitHub keyring entries and instead requires
`PRODUCTION_GITHUB_CLIENT_ID` and `PRODUCTION_GITHUB_CLIENT_SECRET`; the wrapper
maps those values to the Worker's `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` bindings. Inputs come from either:

1. the invoking process environment (the CI/automation path); or
2. the desktop Secret Service keyring under service `omg-web-alchemy` (the local
   operator path).

The wrapper invokes only the already-installed Alchemy CLI and never places
secret values in argv or project files. To provision or rotate one local entry,
run the following and enter the value on standard input:

```bash
secret-tool store \
  --label='OMG web Alchemy GITHUB_CLIENT_SECRET' \
  service omg-web-alchemy \
  key GITHUB_CLIENT_SECRET
```

Repeat with the relevant key name. Use `PRODUCTION_GITHUB_CLIENT_ID` and
`PRODUCTION_GITHUB_CLIENT_SECRET` for the production OAuth app. Validate shadow
injection with `cd site-svelte && npm run plan -- --stage shadow`; the plan must
not print any value. A production plan must fail closed until both
stage-specific production GitHub inputs exist. After rotation, deploy and
complete the live auth gate before clearing the old provider credential. Never
recreate `site-svelte/.env`.

**Sessions are not portable between the two runtimes.** Each derives its session tokens, signatures, and encrypted payloads from a different secret: production uses the human-provisioned Wrangler secret; the shadow uses an Alchemy-generated random value that is stable redacted state, deliberately different from production's. A session created by one runtime will not validate in the other. **Shadow sessions must never be presented as cutover-compatible sessions** — the shadow's green live checks prove runtime compatibility only, never session continuity ([readiness doc](./cloudflare-environment-readiness.md), "Alchemy migration authority").

## 2. Session continuity options at domain cutover

### Option A — coordinated versioned-secret rollover (zero-logout)

Better Auth `1.7.1` supports non-destructive secret rotation through versioned secrets. Verified against the installed package:

- Types: `secrets?: Array<{ version: number; value: string }>` — "Versioned secrets for non-destructive secret rotation… First entry is the current key used for new encryption. Remaining entries are decryption-only (previous rotations)." Also settable via the `BETTER_AUTH_SECRETS` env var in `<version>:<secret>,<version>:<secret>` form; when set, `secret` is only a legacy fallback for bare-hex payloads predating the envelope format. See `site/node_modules/@better-auth/core/dist/types/init-options.d.mts` (~lines 505–522).
- Runtime wiring: `options.secrets ?? parseSecretsEnv(env.BETTER_AUTH_SECRETS)` with `buildSecretConfig` producing `{ keys: Map<number,string>, currentVersion, legacySecret }` — see `site/node_modules/better-auth/dist/context/create-context.mjs` (~line 69) and `site/node_modules/better-auth/dist/context/secret-utils.mjs`. Both `site/` and `site-svelte/` resolve better-auth `1.7.1`.

Rollover shape:

1. Introduce a fresh versioned secret as the current (first) entry on **both** runtimes, keeping the production secret available as the legacy/previous entry during the overlap.
2. Re-run the full live gate; explicitly confirm pre-existing production sessions still authenticate after the change before proceeding.
3. At domain cutover, both runtimes share the identical versioned set, so in-flight sessions survive the switch.

Trade-offs:

- **Pro:** users stay logged in across cutover; no forced reauthentication.
- **Con:** requires a coordinated secret/config change to _production_ `omg-site` ahead of the cutover window, plus a second coordinated change to retire the old version after the observation window.
- **Con:** continuity depends on the legacy-fallback path actually covering every persisted payload shape; treat step 2 above as a hard gate, not a formality.

### Option B — one-time coordinated logout rotation (default recommendation)

Accept that every existing session dies at cutover: rotate `BETTER_AUTH_SECRET` on the new runtime to a fresh value, delete stale `auth_session` rows, and let users re-authenticate (GitHub OAuth round-trip, or password sign-in for controlled accounts).

Trade-offs:

- **Pro:** simplest operationally — no pre-cutover production change, no overlap bookkeeping, no reliance on decryption fallbacks.
- **Con:** forces logout of all accounts. With today's small set of controlled accounts this cost is minimal; revisit if the user base grows before cutover.

**Default to Option B.** Escalate to Option A only if a zero-logout requirement exists at cutover time.

### Option C — service-binding proxy keeping auth on the legacy Worker

SvelteKit forwards `/api/auth/*` to `omg-site` over a Cloudflare Service Binding, so the legacy Worker remains the auth authority after the frontend cutover.

Trade-offs:

- **Pro:** perfect session continuity with zero rotation; smallest immediate blast radius.
- **Con:** keeps the SolidStart-era auth surface alive indefinitely, blocks removal of `omg-site` (slice 7), adds per-request binding latency and a second failure domain inside the auth path, and contradicts the coexistence rule that complete path slices move whole — including their endpoints ([research doc](../research/production-recovery-and-svelte-migration.md), "Safe coexistence").

Not recommended except as an emergency bridge while debugging a failed cutover; it must be removed before `omg-site` decommissioning.

## 3. Cutover checklist

Run every step from a clean tree that passes CI. Roll back immediately on any failed gate rather than pushing forward. Code rollbacks revert code only, never D1 schema or data ([readiness doc](./cloudflare-environment-readiness.md), "Rollback pairing rule") — this plan touches no schema.

### Preconditions (gate — abort if unmet)

- [ ] Shadow live checks green on the current commit: anonymous session lookup (`200 null`), invalid-password rejection (`401`), disabled signup (`400`, no user row written), full GitHub OAuth round-trip with verified session and clean sign-out, security headers, no-op follow-up plan.
- [ ] `npm run check:migrations` green; remote migration inventory in the readiness doc is current.
- [ ] `site` Playwright E2E green against production (`E2E_*` credentials provided per-run).

### Steps

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Rollback                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Bind production GitHub credentials at deploy time.** Provision a dedicated production GitHub OAuth app with callback `https://omg.latham.cloud/api/auth/callback/github`, then store its values as `PRODUCTION_GITHUB_CLIENT_ID` and `PRODUCTION_GITHUB_CLIENT_SECRET` in the deploy environment or the `omg-web-alchemy` keyring. The wrapper maps only those stage-specific values for `--stage prod` and refuses fallback to the currently shared shadow app. Verify the shadow-stage plan remains a no-op. | Remove or correct the production-specific inputs; the shadow stage remains untouched. Leave the unused production app disabled or remove it only after rollback is complete.                                               |
| 2   | **Execute the chosen continuity option.** Option B: provision the fresh production secret to the new stack's `BETTER_AUTH_SECRET` binding and schedule `auth_session` cleanup. Option A: apply the versioned set to production `omg-site` first, verify existing sessions still authenticate (hard gate), mirror the identical set onto the new stack. Never copy the shadow's `ShadowAuthSecret` into production or vice versa.                                                                                 | Option B: nothing to undo (old rows remain until pruned). Option A: revert `omg-site` to its prior secret configuration via `npx wrangler rollback` on `omg-site` (secret-bearing deploys are versioned); re-verify login. |
| 3   | **Switch the whole hostname.** Add one full-host `omg.latham.cloud/*` Worker Route to the production Svelte Worker while retaining the existing `omg-site` Custom Domain as the dormant rollback origin. This moves every path together without a legacy proxy or path exceptions. Keep `workers.dev` surfaces disabled outside `shadow`.                                                                                                                                                                        | Remove the Svelte whole-host route so the retained `omg-site` Custom Domain resumes immediately; if the new Worker itself is faulty, also roll back its version after traffic is restored.                                 |
| 4   | **Verification gates (all must pass before declaring success).**                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Re-run the full gate after any rollback+retry.                                                                                                                                                                             |

Gate details for step 4, mirroring the characterization checks already proven on the shadow ([readiness doc](./cloudflare-environment-readiness.md)):

- [ ] Anonymous session lookup returns `200` with a `null` session.
- [ ] Invalid password returns `401`.
- [ ] Signup attempt returns `400` and writes **no** `auth_user` row (verify in D1).
- [ ] Complete GitHub OAuth round-trip against `https://omg.latham.cloud/api/auth/callback/github`: redirect → callback → verified session cookie → protected page renders → sign-out clears `auth_session`.
- [ ] POST auth mutations still pass the native `10/60s` per-IP rate-limiting binding; missing/thrown binding fails closed (`503`), per `enforceAuthMutationRateLimit` in `site-svelte/src/lib/server/auth.server.ts`.
- [ ] If Option A: a session minted **before** cutover still authenticates **after** it.
- [ ] Security headers and `X-Robots-Tag` posture match production expectations.

### Post-cutover

- [ ] Observation window per slice 7 of the research doc before removing anything.
- [ ] Option A only: retire the superseded secret version once no traffic references it.
- [ ] Update the readiness doc's deployed-topology table and remaining-steps list to reflect the new owner of `/api/auth/*`.

## 4. Explicit non-goals

- **No `--legacy-peer-deps`.** The Better Auth `@sveltejs/kit: ^2` peer staleness is handled exclusively by the package-scoped npm override in `site-svelte/package.json`; keep it until Better Auth widens its peer metadata, and re-run the full live gate before changing either pin ([research doc](../research/production-recovery-and-svelte-migration.md), "Auth compatibility gate").
- **No bulk `alchemy adopt`.** Existing production Workers and the shared D1 stay under their Wrangler owners during coexistence. Any future adoption is resource-specific with its own plan, characterization gate, and rollback command; `--adopt` is never applied indiscriminately ([readiness doc](./cloudflare-environment-readiness.md), "Alchemy migration authority").
- **Google stays removed.** The product accepts GitHub identities only; no Google provider is configured in either runtime (`socialProviders` in `site/src/lib/auth.ts` is empty unless GitHub credentials exist; `auth.server.ts` declares GitHub alone).

## See also

- [`svelte-production-cutover.md`](./svelte-production-cutover.md)
- [`cloudflare-environment-readiness.md`](./cloudflare-environment-readiness.md)
- [`../research/production-recovery-and-svelte-migration.md`](../research/production-recovery-and-svelte-migration.md)
