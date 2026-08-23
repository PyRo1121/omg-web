#!/usr/bin/env bash
#
# PoC driver for p10-013-stripe-projection-stale-write (MEDIUM).
#
# Runs the real `handleStripeWebhook` handler inside workerd against a real D1
# binding (@cloudflare/vitest-pool-workers) and interleaves two concurrently
# delivered subscription webhooks so the STALE fetch-then-project snapshot
# commits LAST over a newer cancellation.
#
# Prereqs: `npm install` at repo root (wrangler + @cloudflare/vitest-plugin).
# No live network, no Stripe account, no app secrets required: the only
# external calls are intercepted by an in-process StripeFetch stub whose
# responses we control to force the losing interleaving.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
WORKERS_DIR="$REPO_ROOT/site/workers"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
TEST_COPY="$WORKERS_DIR/tests/poc-p10-013.test.ts"

mkdir -p "$EVIDENCE_DIR"
trap 'rm -f "$TEST_COPY"' EXIT

cp "$SCRIPT_DIR/poc.test.ts" "$TEST_COPY"
cd "$WORKERS_DIR"

set +o pipefail
npx vitest run --config vitest.config.ts --disableConsoleIntercept tests/poc-p10-013.test.ts 2>&1 | tee "$EVIDENCE_DIR/exploit.log"
RC=${PIPESTATUS[0]}
set -o pipefail

if [ "$RC" -eq 0 ]; then
  echo '{"status": "confirmed", "evidence": "cancelled Stripe subscription reverted to pro/active by stale concurrent projection; validate-license mints Pro JWT from stale licenses row", "notes": "executed against real workerd+D1 via vitest-pool-workers; two distinct signed webhook events race through reconcileStripeSubscriptionSignal"}'
else
  echo '{"status": "failed", "evidence": "", "notes": "race not reproduced; see evidence/exploit.log"}'
fi
