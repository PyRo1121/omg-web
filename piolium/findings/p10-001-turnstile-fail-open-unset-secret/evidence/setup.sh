#!/usr/bin/env bash
# p10-001 environment provisioning check.
# Environment = repo's own vitest cloudflare pool: workerd + local D1 with the
# production migration baseline (site/workers/migrations), per wrangler.test.toml.
set -e
REPO="$(cd "$(dirname "$0")"/../../../.. && pwd)"
W="$REPO/site/workers"
echo "[setup] repo: $REPO"
test -f "$W/vitest.config.ts" && echo "[setup] vitest cloudflare pool config present"
test -f "$W/wrangler.test.toml" && echo "[setup] wrangler.test.toml present (local D1 + R2 bindings)"
ls "$W"/migrations/*.sql >/dev/null && echo "[setup] production D1 migrations present: $(ls "$W"/migrations/*.sql | wc -l) files"
test -d "$W/node_modules/@cloudflare/vitest-plugin" && echo "[setup] @cloudflare/vitest-pool-workers installed"
grep -n "TURNSTILE_SECRET_KEY" "$W/src/handlers/auth.ts" | head -2 || true
echo "[setup] note: TURNSTILE_SECRET_KEY is intentionally NOT set anywhere in test bindings - this IS the vulnerable default configuration under test"
