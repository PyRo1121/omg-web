#[v4-adapted] cosmetic healthcheck vitest pre-run stripped to fit 30s variant budget
#!/usr/bin/env bash
# p10-012 PoC runner — executes poc.test.ts against the real worker in workerd
# (@cloudflare/vitest pool + local D1 seeded with production migrations).
#
# Usage: bash poc.sh [repo-root]   (default: auto-detect from script location)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
WORKERS_DIR="$REPO_ROOT/site/workers"
EVDIR="$SCRIPT_DIR/evidence"
mkdir -p "$EVDIR"

TMP_TEST="$WORKERS_DIR/tests/p10-012-resurrect-poc.adversarial.test.ts"
cleanup() { rm -f "$TMP_TEST"; }
trap cleanup EXIT

cp "$SCRIPT_DIR/poc.test.ts" "$TMP_TEST"

{
  echo "repo_root: $REPO_ROOT"
  echo "worker: site/workers/src/worker.ts via @cloudflare/vitest pool (workerd)"
  echo "d1: local miniflare D1, production migrations applied"
  echo "auth: dashboard session seeded in sessions table so the REAL"
  echo "  POST /api/machines/revoke handler (dashboard.ts:191) performs the revocation"
  echo "config: JWT_SECRET set (HS256 mint path); license seeded pro/max_machines=1"
} > "$EVDIR/env-info.txt"

# setup.sh equivalent: provisioning is the vitest cloudflare pool itself.
cat > "$EVDIR/setup.sh" <<'EOF'
#!/usr/bin/env bash
# Environment = @cloudflare/vitest pool (workerd) + local miniflare D1 with
# site/workers/migrations applied. Provisioned implicitly by `npx vitest run`
# inside site/workers; no external services required.
set -euo pipefail
cd "$(dirname "$0")"/../../../site/workers
npx vitest run tests/validate-license-contract.test.ts
EOF
chmod +x "$EVDIR/setup.sh"


echo "== exploit run =="
set +e
(cd "$WORKERS_DIR" && npx vitest run tests/p10-012-resurrect-poc.adversarial.test.ts --reporter=verbose 2>&1) | tee "$EVDIR/exploit.log"
VITEST_RC=${PIPESTATUS[0]}
set -e

grep -E "p10-012" "$EVDIR/exploit.log" > "$EVDIR/impact.log" || true

# Structured verdict for poc-executor: confirmed iff the revoked machine got a
# fresh signed JWT AND a second machine squeezed onto the max_machines=1 seat.
RESURRECT=$(sed -n 's/.*RESURRECTION: revoked machine re-validated valid=\(true\|false\).*/\1/p' "$EVDIR/impact.log" | tail -1)
JWT=$(grep -c "fresh_signed_jwt=yes" "$EVDIR/impact.log" || true)
SEAT=$(sed -n 's/.*SEAT-FREED: second distinct machine activation valid=\(true\|false\).*/\1/p' "$EVDIR/impact.log" | tail -1)

if [ "$RESURRECT" = "true" ] && [ "$JWT" -ge 1 ] && [ "$SEAT" = "true" ]; then
  STATUS="confirmed"
  EVIDENCE="machine with is_active=0 (revoked via real /api/machines/revoke) re-validated successfully and received a fresh signed ~7-day offline license JWT, while its freed seat let a second distinct machine activate on the same max_machines=1 license"
else
  STATUS="failed"
  EVIDENCE="resurrection did not reproduce (resurrect_valid=${RESURRECT:-unknown}, fresh_jwt=$JWT, second_seat=${SEAT:-unknown})"
fi

echo "{\"status\": \"$STATUS\", \"evidence\": \"$EVIDENCE\", \"notes\": \"vitest rc=$VITEST_RC; real worker.fetch in workerd against local D1 with production migrations; revocation performed through the authenticated /api/machines/revoke handler\"}"
