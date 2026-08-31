---
name: verify-omg-web
description: Drive and verify the omg-web SvelteKit web UI with its Playwright harness; use after changing public, account, billing, authentication, or operator behavior in this repository.
---

# Verify omg-web

The primary surface is `site-svelte/`, the SvelteKit migration target. Playwright is the canonical user-level harness. `workers/api/` is the private licensing API and `site/` is the temporary Solid production authority; verify those with their focused tests and Wrangler gates when a change touches them.

Read `features/README.md`, then the relevant feature file before driving. Local Vite has no Cloudflare bindings: public behavior works locally, while authentication deliberately fails closed. Bound and authenticated checks require a deployed Svelte URL and controlled credentials.

## Launch

Use one isolated local instance on port `4173`. Refuse to launch if the port is already occupied and the recorded PID is not yours.

```bash
export OMG_VERIFY_ROOT="$HOME/.cache/build-targets/omg-web-verify"
mkdir -p "$OMG_VERIFY_ROOT/evidence"
if ss -ltn '( sport = :4173 )' | grep -q LISTEN; then
  echo 'port 4173 is already occupied; do not double-drive it' >&2
  exit 1
fi
cd site-svelte
setsid npm run dev:e2e >"$OMG_VERIFY_ROOT/vite.log" 2>&1 &
echo "$!" >"$OMG_VERIFY_ROOT/vite.pid"
for _ in $(seq 1 60); do
  curl --fail --silent http://127.0.0.1:4173/health >/dev/null 2>&1 && break
  sleep 1
done
curl --fail --silent --show-error http://127.0.0.1:4173/health >/dev/null
```

The instance is ready when Doctor returns the exact health projection. Teardown is the Cleanup procedure below.

For a deployed runtime, do not start a local server. Set `E2E_BASE_URL=https://<svelte-deployment>` and use `npm run test:e2e:external`.

## Doctor

Run this before every local drive:

```bash
export OMG_VERIFY_ROOT="$HOME/.cache/build-targets/omg-web-verify"
pid="$(cat "$OMG_VERIFY_ROOT/vite.pid")"
kill -0 "$pid"
ps -o pid=,pgid=,args= -g "$pid"
curl --fail --silent --show-error http://127.0.0.1:4173/health \
  | tee "$OMG_VERIFY_ROOT/evidence/doctor-health.json"
```

The response must be `{"runtime":"sveltekit-alchemy","status":"ok"}` and the process-group listing must show the `site-svelte` Vite command. If either check fails, run Cleanup and relaunch. Do not reuse an unowned process on port `4173`.

For a deployed runtime, Doctor is:

```bash
curl --fail --silent --show-error "$E2E_BASE_URL/health"
```

## Drive

Run from `site-svelte/`. A manually launched local instance is reused by Playwright:

```bash
npm run test:e2e -- e2e/anonymous.spec.ts
npm run test:e2e -- e2e/billing-unconfigured.spec.ts
```

Use stable ARIA roles and route paths already encoded in the specs. Do not replace them with coordinates or test-only endpoints.

Deployed anonymous/auth-entry characterization:

```bash
E2E_BASE_URL=https://<svelte-deployment> npm run test:e2e:external -- \
  e2e/anonymous.spec.ts e2e/signup.spec.ts
```

Authenticated characterization requires designated accounts and must run singly because logout invalidates the shared controlled session:

```bash
E2E_BASE_URL=https://<svelte-deployment> \
E2E_USER_EMAIL=... E2E_USER_PASSWORD='...' \
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD='...' \
npm run test:e2e:external -- e2e/staging-auth.spec.ts
```

Never put credentials in evidence, shell history committed to the repository, screenshots, or logs. Browser automation must not create organizations, Stripe customers, Checkout Sessions, or subscriptions.

## Evidence

Store durable verification evidence under:

```text
~/.cache/build-targets/omg-web-verify/evidence/
```

Capture the drive command and result together:

```bash
npm run test:e2e -- e2e/anonymous.spec.ts 2>&1 \
  | tee "$OMG_VERIFY_ROOT/evidence/anonymous-playwright.txt"
```

A valid proof:

- exercises the real route and user control, not an internal setter or test-only endpoint;
- records both the action and resulting state;
- verifies relevant side effects such as the fixed CSV filename or post-logout redirect;
- retains Playwright traces/screenshots/videos from `site-svelte/test-results/` when a failure needs diagnosis;
- uses mocks only at an already isolated production boundary;
- does not claim bound authentication from local Vite, where bindings are intentionally absent.

For API changes, also retain the focused Worker test result and the exact bounded HTTP status/body smoke. For deployment changes, retain the Alchemy plan and deployed version without recording secrets.

## Cleanup

Stop only the process group recorded at launch. Preserve `evidence/` and `vite.log`.

```bash
export OMG_VERIFY_ROOT="$HOME/.cache/build-targets/omg-web-verify"
if test -f "$OMG_VERIFY_ROOT/vite.pid"; then
  pid="$(cat "$OMG_VERIFY_ROOT/vite.pid")"
  kill -- -"$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  rm -f "$OMG_VERIFY_ROOT/vite.pid"
fi
```

Confirm `curl http://127.0.0.1:4173/health` no longer connects and the evidence files still exist. Do not use `pkill`, kill by process name, or delete the evidence directory.

## Helpers

No custom helper is required. The maintained helpers are the repository's `site-svelte/playwright.config.ts`, `site-svelte/e2e/helpers.ts`, and package scripts shown above.
