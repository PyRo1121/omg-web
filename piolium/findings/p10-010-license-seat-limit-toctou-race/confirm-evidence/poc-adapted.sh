#!/usr/bin/env bash
# p10-010 PoC runner — executes poc.test.ts against the real worker in workerd
# (@cloudflare/vitest pool + local D1 seeded with production migrations).
#
# Usage: bash poc.sh [repo-root]   (default: auto-detect from script location)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
WORKERS_DIR="$REPO_ROOT/site/workers"
EVDIR="$SCRIPT_DIR/evidence"
mkdir -p "$EVDIR"

TMP_TEST="$WORKERS_DIR/tests/p10-010-seat-toctou-poc.adversarial.test.ts"
cleanup() { rm -f "$TMP_TEST"; }
trap cleanup EXIT

cp "$SCRIPT_DIR/poc.test.ts" "$TMP_TEST"

{
  echo "repo_root: $REPO_ROOT"
  echo "worker: site/workers/src/worker.ts via @cloudflare/vitest pool (workerd)"
  echo "d1: local miniflare D1, production migrations applied"
  echo "  (machines table has UNIQUE(license_id, machine_id) — irrelevant here:"
  echo "   every racing request uses a DISTINCT machine_id)"
  echo "config: JWT_SECRET set (HS256 mint path); license seeded pro/max_machines=2"
} > "$EVDIR/env-info.txt"

echo "== healthcheck: validate-license contract suite sanity (schema applies, worker boots) ==" | tee "$EVDIR/healthcheck.log"
(cd "$WORKERS_DIR" && npx vitest run tests/validate-license-contract.test.ts --reporter=basic 2>&1 | tail -8) | tee -a "$EVDIR/healthcheck.log" || true
# NOTE: reporter name differs across vitest majors; if basic fails this is
# cosmetic only — exploit run below is authoritative.

echo "== exploit run =="
set +e
(cd "$WORKERS_DIR" && npx vitest run tests/p10-010-seat-toctou-poc.adversarial.test.ts --reporter=verbose 2>&1) | tee "$EVDIR/exploit.log"
VITEST_RC=${PIPESTATUS[0]}
set -e

grep -E "p10-010" "$EVDIR/exploit.log" > "$EVDIR/impact.log" || true

# Structured verdict for poc-executor: confirmed iff active machines > paid cap.
ROWS=$(sed -n 's/.*active machines for license after burst = \([0-9]*\).*/\1/p' "$EVDIR/impact.log" | tail -1)
GRANTED=$(sed -n 's/.*burst: \([0-9]*\)\/[0-9]* activations.*/\1/p' "$EVDIR/impact.log" | tail -1)
if [ -n "$ROWS" ] && [ "$ROWS" -gt 2 ]; then
  STATUS="confirmed"
  EVIDENCE="D1 contains $ROWS active machine rows for one pro license whose paid max_machines=2, after a single concurrent burst of validate-license calls that granted $GRANTED signed offline-valid JWTs"
else
  STATUS="failed"
  EVIDENCE="concurrent burst did not exceed max_machines=2 (active_machines=${ROWS:-unknown}, granted=${GRANTED:-unknown})"
fi

echo "{\"status\": \"$STATUS\", \"evidence\": \"$EVIDENCE\", \"notes\": \"vitest rc=$VITEST_RC; real worker.fetch in workerd against local D1 with production migrations\"}"
