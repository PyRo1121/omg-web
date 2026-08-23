#!/usr/bin/env bash
# Provision/verify the local real-environment harness for p10-013.
# The environment IS the repository's own test stack: workerd + real D1 via
# @cloudflare/vitest-pool-workers (no Docker needed; workerd ships as an npm
# binary). No Stripe keys or app secrets required — the Stripe API boundary is
# controlled in-process to force the losing commit ordering.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
WORKERS_DIR="$REPO_ROOT/site/workers"
EVIDENCE_DIR="$SCRIPT_DIR"

{
  echo "== node/npm =="
  node --version
  npm --version
  echo "== key deps installed at pinned vulnerable versions =="
  node -e "
    const pkg = require('$WORKERS_DIR/package.json');
    for (const d of ['wrangler', '@cloudflare/vitest-plugin', 'vitest', 'effect'])
      console.log(d + ': ' + (pkg.dependencies[d] || pkg.devDependencies[d]));
  "
  test -d "$WORKERS_DIR/node_modules/@cloudflare/vitest-plugin" && \
    echo "@cloudflare/vitest-plugin: installed at $WORKERS_DIR/node_modules/@cloudflare/vitest-plugin"
} >"$EVIDENCE_DIR/env-info.txt" 2>&1
cat "$EVIDENCE_DIR/env-info.txt"

{
  echo "Provisioning: none beyond npm install (workerd provided by wrangler dep)."
  echo "Verifying migrations used by the isolated D1 database exist:"
  ls "$WORKERS_DIR/migrations"
} >"$EVIDENCE_DIR/setup.log" 2>&1

# Healthcheck: run the project's own Stripe webhook inbox suite on the same
# stack to prove the harness (workerd + D1 + signed webhook requests) works
# before running the exploit.
cd "$WORKERS_DIR"
npx vitest run --config vitest.config.ts tests/stripe-webhook-inbox.test.ts \
  >"$EVIDENCE_DIR/healthcheck.log" 2>&1
HEALTH_RC=$?
tail -6 "$EVIDENCE_DIR/healthcheck.log"
exit "$HEALTH_RC"
