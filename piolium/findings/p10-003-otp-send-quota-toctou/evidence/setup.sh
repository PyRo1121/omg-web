#!/usr/bin/env bash
# p10-003 environment provisioning.
#
# No external services are needed: the PoC runs inside @cloudflare/vitest-pool-workers
# (real workerd runtime) against a local miniflare D1 database seeded with the
# repo's own production migrations. This mirrors how P11 cold-verification
# executed its real-environment tests for this same worker.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT/site/workers"

echo "[setup] installing dependencies (skips if node_modules present)"
[ -d node_modules ] || npm ci

echo "[setup] verifying migrations exist"
ls migrations/*.sql | head

echo "[setup] provisioning complete — workerd + local D1 provided by vitest cloudflareTest pool"
