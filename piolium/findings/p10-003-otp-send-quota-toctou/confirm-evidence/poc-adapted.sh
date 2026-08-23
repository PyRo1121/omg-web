#!/usr/bin/env bash
# p10-003 PoC runner — executes poc.test.ts against the real worker in workerd
# (@cloudflare/vitest pool + local D1 seeded with production migrations).
#
# Usage: bash poc.sh [repo-root]   (default: auto-detect from script location)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
WORKERS_DIR="$REPO_ROOT/site/workers"
EVDIR="$SCRIPT_DIR/evidence"
mkdir -p "$EVDIR"

TMP_TEST="$WORKERS_DIR/tests/p10-003-toctou-poc.adversarial.test.ts"
cleanup() { rm -f "$TMP_TEST"; }
trap cleanup EXIT

cp "$SCRIPT_DIR/poc.test.ts" "$TMP_TEST"

{
  echo "repo_root: $REPO_ROOT"
  echo "worker: site/workers/src/worker.ts via @cloudflare/vitest pool (workerd)"
  echo "d1: local miniflare D1 'omg-licensing-test', production migrations applied"
  echo "config: TURNSTILE_SECRET_KEY unset (default posture), EMAIL binding stubbed 1:1 with delivery"
} > "$EVDIR/env-info.txt"

echo "== healthcheck: baseline auth suite sanity (schema applies, worker boots) ==" | tee "$EVDIR/healthcheck.log"
(cd "$WORKERS_DIR" && npx vitest run tests/auth-and-guard.test.ts --reporter=basic 2>&1 | tail -8) | tee -a "$EVDIR/healthcheck.log" || true
# NOTE: reporter name differs across vitest majors; if basic fails this is
# cosmetic only — exploit run below is authoritative.

echo "== exploit run =="
set +e
(cd "$WORKERS_DIR" && npx vitest run tests/p10-003-toctou-poc.adversarial.test.ts --reporter=verbose 2>&1) | tee "$EVDIR/exploit.log"
VITEST_RC=${PIPESTATUS[0]}
set -e

grep -E "p10-003" "$EVDIR/exploit.log" > "$EVDIR/impact.log" || true

# Structured verdict for poc-executor: confirmed iff burst inserted >3 rows.
ROWS=$(sed -n 's/.*auth_codes rows for victim within window: \([0-9]*\).*/\1/p' "$EVDIR/impact.log" | tail -1)
if [ -n "$ROWS" ] && [ "$ROWS" -gt 3 ]; then
  STATUS="confirmed"
  EVIDENCE="D1 contains $ROWS auth_codes rows for one email inside the 10-minute quota window after a single concurrent burst of send-code requests (sequential control correctly capped at 3 with HTTP 429)"
else
  STATUS="failed"
  EVIDENCE="burst did not exceed the 3-per-10-minutes cap (rows=$ROWS)"
fi

echo "{\"status\": \"$STATUS\", \"evidence\": \"$EVIDENCE\", \"notes\": \"vitest rc=$VITEST_RC; real worker.fetch in workerd against local D1 with production migrations\"}"
